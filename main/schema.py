import graphene
from .models import User, UserModel
from django.utils import timezone

class UserType(graphene.ObjectType):
    id = graphene.String()
    username = graphene.String()
    email = graphene.String()
    is_admin = graphene.Boolean()
    created_at = graphene.String()
    models_count = graphene.Int()

    def resolve_id(self, info):
        return str(self.id)
    
    def resolve_created_at(self, info):
        return self.created_at.isoformat() if self.created_at else None
    
    def resolve_models_count(self, info):
        return UserModel.objects.filter(user=self).count()


class ModelType(graphene.ObjectType):
    id = graphene.String()
    file_id = graphene.String()
    title = graphene.String()
    description = graphene.String()
    is_public = graphene.Boolean()
    created_at = graphene.String()
    user_id = graphene.String()
    user_username = graphene.String()
    user_email = graphene.String()

    def resolve_id(self, info):
        return str(self.id)
    
    def resolve_created_at(self, info):
        return self.created_at.isoformat() if self.created_at else None
    
    def resolve_user_id(self, info):
        return str(self.user.id) if self.user else None
    
    def resolve_user_username(self, info):
        return self.user.username if self.user else None
    
    def resolve_user_email(self, info):
        return self.user.email if self.user else None


class Query(graphene.ObjectType):
    all_users = graphene.List(UserType, search=graphene.String(), page=graphene.Int(), per_page=graphene.Int())
    all_models = graphene.List(ModelType, user_id=graphene.String(), search=graphene.String(), page=graphene.Int(), per_page=graphene.Int())
    stats = graphene.JSONString()
    user_detail = graphene.Field(UserType, user_id=graphene.String(required=True))
    model_detail = graphene.Field(ModelType, model_id=graphene.String(required=True))

    def resolve_all_users(self, info, search=None, page=1, per_page=20):
        user = info.context.get('user')
        if not user or not user.is_admin:
            raise Exception('Admin permission required')
        qs = User.objects.all()
        if search:
            qs = qs.filter(username__icontains=search) | qs.filter(email__icontains=search)
        skip = (page - 1) * per_page
        return list(qs.skip(skip).limit(per_page))

    def resolve_all_models(self, info, user_id=None, search=None, page=1, per_page=20):
        user = info.context.get('user')
        if not user or not user.is_admin:
            raise Exception('Admin permission required')
        qs = UserModel.objects.all()
        if user_id:
            qs = qs.filter(user__id=user_id)
        if search:
            qs = qs.filter(title__icontains=search)
        skip = (page - 1) * per_page
        return list(qs.skip(skip).limit(per_page))

    def resolve_stats(self, info):
        user = info.context.get('user')
        if not user or not user.is_admin:
            raise Exception('Admin permission required')
        total_users = User.objects.count()
        total_models = UserModel.objects.count()
        public_models = UserModel.objects.filter(is_public=True).count()
        total_storage_mb = sum(m.file_size_mb or 0 for m in UserModel.objects.all())
        models_with_glb = UserModel.objects.filter(has_glb_export=True).count()
        today = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        users_joined_today = User.objects.filter(created_at__gte=today).count()
        models_created_today = UserModel.objects.filter(created_at__gte=today).count()
        return {
            'total_users': total_users,
            'total_models': total_models,
            'public_models': public_models,
            'private_models': total_models - public_models,
            'total_storage_mb': round(total_storage_mb, 2),
            'models_with_glb': models_with_glb,
            'users_joined_today': users_joined_today,
            'models_created_today': models_created_today
        }

    def resolve_user_detail(self, info, user_id):
        user = info.context.get('user')
        if not user or not user.is_admin:
            raise Exception('Admin permission required')
        try:
            return User.objects.get(id=user_id)
        except User.DoesNotExist:
            return None

    def resolve_model_detail(self, info, model_id):
        user = info.context.get('user')
        if not user or not user.is_admin:
            raise Exception('Admin permission required')
        try:
            return UserModel.objects.get(id=model_id)
        except UserModel.DoesNotExist:
            return None


class CreateUser(graphene.Mutation):
    class Arguments:
        username = graphene.String(required=True)
        email = graphene.String(required=True)
        password = graphene.String(required=True)
        is_admin = graphene.Boolean(default_value=False)
    
    success = graphene.Boolean()
    message = graphene.String()
    user_id = graphene.String()
    
    def mutate(self, info, username, email, password, is_admin=False):
        user_obj = info.context.get('user')
        if not user_obj or not user_obj.is_admin:
            raise Exception('Admin permission required')
        if User.objects.filter(username=username).count() > 0:
            return CreateUser(success=False, message='Username already taken', user_id=None)
        if User.objects.filter(email=email).count() > 0:
            return CreateUser(success=False, message='Email already registered', user_id=None)
        if len(password) < 6:
            return CreateUser(success=False, message='Password too short', user_id=None)
        user = User(username=username, email=email.lower(), is_admin=is_admin)
        user.set_password(password)
        user.save()
        return CreateUser(success=True, message='User created', user_id=str(user.id))


class UpdateUser(graphene.Mutation):
    class Arguments:
        user_id = graphene.String(required=True)
        username = graphene.String()
        email = graphene.String()
        password = graphene.String()
        is_admin = graphene.Boolean()
    
    success = graphene.Boolean()
    message = graphene.String()
    
    def mutate(self, info, user_id, username=None, email=None, password=None, is_admin=None):
        user_obj = info.context.get('user')
        if not user_obj or not user_obj.is_admin:
            raise Exception('Admin permission required')
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return UpdateUser(success=False, message='User not found')
        if username and username != user.username:
            if User.objects.filter(username=username).count() > 0:
                return UpdateUser(success=False, message='Username taken')
            user.username = username
        if email and email.lower() != user.email:
            if User.objects.filter(email=email.lower()).count() > 0:
                return UpdateUser(success=False, message='Email taken')
            user.email = email.lower()
        if password:
            user.set_password(password)
        if is_admin is not None:
            user.is_admin = is_admin
        user.save()
        return UpdateUser(success=True, message='User updated')


class DeleteUser(graphene.Mutation):
    class Arguments:
        user_id = graphene.String(required=True)
    
    success = graphene.Boolean()
    message = graphene.String()
    
    def mutate(self, info, user_id):
        user_obj = info.context.get('user')
        if not user_obj or not user_obj.is_admin:
            raise Exception('Admin permission required')
        try:
            user = User.objects.get(id=user_id)
            if str(user.id) == str(user_obj.id):
                return DeleteUser(success=False, message='You cannot delete yourself')
            user.delete()
            return DeleteUser(success=True, message='User deleted')
        except User.DoesNotExist:
            return DeleteUser(success=False, message='User not found')


class DeleteModel(graphene.Mutation):
    class Arguments:
        model_id = graphene.String(required=True)
    
    success = graphene.Boolean()
    message = graphene.String()
    
    def mutate(self, info, model_id):
        user_obj = info.context.get('user')
        if not user_obj or not user_obj.is_admin:
            raise Exception('Admin permission required')
        try:
            model = UserModel.objects.get(id=model_id)
            model.delete()
            return DeleteModel(success=True, message='Model deleted')
        except UserModel.DoesNotExist:
            return DeleteModel(success=False, message='Model not found')


class Mutation(graphene.ObjectType):
    create_user = CreateUser.Field()
    update_user = UpdateUser.Field()
    delete_user = DeleteUser.Field()
    delete_model = DeleteModel.Field()


schema = graphene.Schema(query=Query, mutation=Mutation)