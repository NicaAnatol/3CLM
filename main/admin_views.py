import graphene
import json
import os
import uuid
import secrets
from django.utils import timezone
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import render, redirect
from django.utils.decorators import method_decorator
from django.contrib.auth.hashers import make_password, check_password
import os
from django.http import FileResponse
from django.core.files.storage import default_storage
# IMPORTS SPECIFICE MONGOENGINE ȘI GRAPHENE
from mongoengine import Document, StringField, IntField, BooleanField, DateTimeField, ReferenceField, ListField, FloatField, DictField
from mongoengine.queryset.visitor import Q
from graphene_django.views import GraphQLView
from graphene.types.generic import GenericScalar  # Rezolvă problema fără a schimba frontend-ul
from django.views.decorators.cache import never_cache
from .decorators import admin_required
from django.conf import settings
# ==================== MONGOENGINE MODELS ====================

class User(Document):
    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    username = StringField(max_length=50, unique=True, required=True)
    email = StringField(max_length=255, unique=True, required=True)
    is_admin = BooleanField(default=False)
    password = StringField(max_length=128, required=True)
    profile_picture = StringField()
    is_active = BooleanField(default=True)
    created_at = DateTimeField(default=timezone.now)
    updated_at = DateTimeField(default=timezone.now)
    models_count = IntField(default=0)
    last_model_created = DateTimeField()

    meta = {'collection': 'users'}

    def set_password(self, raw_password):
        self.password = make_password(raw_password)

    def check_password(self, raw_password):
        return check_password(raw_password, self.password)

    def __str__(self):
        return self.username
    

class AuthToken(Document):
    user = ReferenceField(User)
    token = StringField(max_length=64, unique=True, required=True)
    created_at = DateTimeField(default=timezone.now)
    expires_at = DateTimeField(required=True)

    meta = {'collection': 'auth_tokens'}

    def is_valid(self):
        return timezone.now() < self.expires_at

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_hex(32)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Token for {self.user.username}"


class UserModel(Document):
    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    user = ReferenceField(User, reverse_delete_rule=2)  # CASCADE
    file_id = StringField(max_length=100, unique=True, required=True)
    title = StringField(max_length=255, default="New Project")
    description = StringField()
    is_public = BooleanField(default=False)
    thumbnail = StringField()
    camera_position = DictField(default=dict)
    thumbnail_updated = DateTimeField()
    glb_file = StringField()
    glb_file_name = StringField()
    has_glb_export = BooleanField(default=False)
    glb_export_time = DateTimeField()
    total_elements = IntField(default=0)
    file_size_mb = FloatField(default=0.0)
    favorites = ListField(StringField())
    building_count = IntField(default=0)
    highway_count = IntField(default=0)
    water_count = IntField(default=0)
    natural_count = IntField(default=0)
    landuse_count = IntField(default=0)
    other_count = IntField(default=0)
    area_km2 = FloatField(default=0.0)
    public_view_count = IntField(default=0)
    download_count = IntField(default=0)
    user_data = DictField(default=dict)
    created_at = DateTimeField(default=timezone.now)
    updated_at = DateTimeField(default=timezone.now)

    meta = {'collection': 'user_models'}

    def __str__(self):
        return f"{self.title} ({self.file_id})"


# ==================== GRAPHENE TYPES ====================

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


# ==================== GRAPHENE QUERY ====================

class Query(graphene.ObjectType):
    all_users = graphene.List(UserType, search=graphene.String(), page=graphene.Int(), per_page=graphene.Int())
    all_models = graphene.List(ModelType, user_id=graphene.String(), search=graphene.String(), page=graphene.Int(), per_page=graphene.Int())
    
    # REPARAT: Folosim GenericScalar pentru a accepta query-uri simple fără sub-câmpuri
    stats = GenericScalar()
    
    user_detail = graphene.Field(UserType, user_id=graphene.String(required=True))
    model_detail = graphene.Field(ModelType, model_id=graphene.String(required=True))

    def resolve_all_users(self, info, search=None, page=1, per_page=20):
        user = getattr(info.context, 'user', None)
        if not user or not user.is_admin:
            raise Exception('Admin permission required')
        qs = User.objects.all()
        if search:
            qs = qs.filter(Q(username__icontains=search) | Q(email__icontains=search))
        skip = (page - 1) * per_page
        return list(qs.skip(skip).limit(per_page))

    def resolve_all_models(self, info, user_id=None, search=None, page=1, per_page=20):
        user = getattr(info.context, 'user', None)
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
        user = getattr(info.context, 'user', None)
        if not user or not user.is_admin:
            raise Exception('Admin permission required')
        
        total_users = User.objects.count()
        total_models = UserModel.objects.count()
        public_models = UserModel.objects.filter(is_public=True).count()
        
        storage_sum = UserModel.objects.sum('file_size_mb')
        total_storage_mb = round(storage_sum, 2) if storage_sum else 0.0
        
        models_with_glb = UserModel.objects.filter(has_glb_export=True).count()
        today = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        users_joined_today = User.objects.filter(created_at__gte=today).count()
        models_created_today = UserModel.objects.filter(created_at__gte=today).count()
        
        # Siguranță maximă: Trimitem cheile și snake_case și camelCase pentru a preveni 'undefined'
        return {
            # Format Standard (Snake Case)
            'total_users': total_users,
            'total_models': total_models,
            'public_models': public_models,
            'private_models': total_models - public_models,
            'total_storage_mb': total_storage_mb,
            'models_with_glb': models_with_glb,
            'users_joined_today': users_joined_today,
            'models_created_today': models_created_today,
            
            # Format JavaScript (Camel Case)
            'totalUsers': total_users,
            'totalModels': total_models,
            'publicModels': public_models,
            'privateModels': total_models - public_models,
            'totalStorageMb': total_storage_mb,
            'modelsWithGlb': models_with_glb,
            'usersJoinedToday': users_joined_today,
            'modelsCreatedToday': models_created_today
        }

    def resolve_user_detail(self, info, user_id):
        user = getattr(info.context, 'user', None)
        if not user or not user.is_admin:
            raise Exception('Admin permission required')
        try:
            return User.objects.get(id=user_id)
        except User.DoesNotExist:
            return None

    def resolve_model_detail(self, info, model_id):
        user = getattr(info.context, 'user', None)
        if not user or not user.is_admin:
            raise Exception('Admin permission required')
        try:
            return UserModel.objects.get(id=model_id)
        except UserModel.DoesNotExist:
            return None


# ==================== MUTATIONS ====================

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
        user_obj = getattr(info.context, 'user', None)
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
        user_obj = getattr(info.context, 'user', None)
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
        user_obj = getattr(info.context, 'user', None)
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
        user_obj = getattr(info.context, 'user', None)
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


# ==================== REST DJANGO VIEWS ====================

@csrf_exempt
@admin_required
def admin_users(request):
    if request.method == 'GET':
        try:
            page = int(request.GET.get('page', 1))
            per_page = int(request.GET.get('per_page', 20))
            search = request.GET.get('search', '').strip()
            users_qs = User.objects.all()
            if search:
                users_qs = users_qs.filter(Q(username__icontains=search) | Q(email__icontains=search))
            total = users_qs.count()
            users = users_qs.skip((page-1)*per_page).limit(per_page)
            data = [{
                'id': str(u.id),
                'username': u.username,
                'email': u.email,
                'is_admin': u.is_admin,
                'created_at': u.created_at.isoformat(),
                'models_count': UserModel.objects.filter(user=u).count()
            } for u in users]
            return JsonResponse({'success': True, 'users': data, 'total': total, 'page': page, 'per_page': per_page})
        except Exception as e:
            import traceback
            traceback.print_exc()
            return JsonResponse({'success': False, 'error': str(e)}, status=500)

    elif request.method == 'POST':
        try:
            body = json.loads(request.body)
            username = body.get('username', '').strip()
            email = body.get('email', '').strip().lower()
            password = body.get('password', '')
            is_admin = body.get('is_admin', False)
            if not username or not email or not password:
                return JsonResponse({'success': False, 'error': 'Missing fields'}, status=400)
            if User.objects.filter(username=username).count() > 0:
                return JsonResponse({'success': False, 'error': 'Username taken'}, status=400)
            if User.objects.filter(email=email).count() > 0:
                return JsonResponse({'success': False, 'error': 'Email registered'}, status=400)
            if len(password) < 6:
                return JsonResponse({'success': False, 'error': 'Password too short'}, status=400)
            user = User(username=username, email=email, is_admin=is_admin)
            user.set_password(password)
            user.save()
            return JsonResponse({'success': True, 'message': 'User created', 'user_id': str(user.id)})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
@admin_required
def admin_user_detail(request, user_id):
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'User not found'}, status=404)
    if request.method == 'GET':
        data = {
            'id': str(user.id),
            'username': user.username,
            'email': user.email,
            'is_admin': user.is_admin,
            'created_at': user.created_at.isoformat(),
            'models': [{
                'id': str(m.id),
                'file_id': m.file_id,
                'title': m.title,
                'is_public': m.is_public,
                'created_at': m.created_at.isoformat()
            } for m in UserModel.objects.filter(user=user)]
        }
        return JsonResponse({'success': True, 'user': data})
    elif request.method == 'PATCH':
        try:
            body = json.loads(request.body)
            if 'username' in body:
                new_uname = body['username'].strip()
                if new_uname != user.username and User.objects.filter(username=new_uname).count() > 0:
                    return JsonResponse({'success': False, 'error': 'Username taken'}, status=400)
                user.username = new_uname
            if 'email' in body:
                new_email = body['email'].strip().lower()
                if new_email != user.email and User.objects.filter(email=new_email).count() > 0:
                    return JsonResponse({'success': False, 'error': 'Email taken'}, status=400)
                user.email = new_email
            if 'password' in body and body['password']:
                user.set_password(body['password'])
            if 'is_admin' in body:
                user.is_admin = body['is_admin']
            user.save()
            return JsonResponse({'success': True, 'message': 'User updated'})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=500)
    elif request.method == 'DELETE':
        user.delete()
        return JsonResponse({'success': True, 'message': 'User deleted'})

@csrf_exempt
@admin_required
def admin_models(request):
    if request.method == 'GET':
        try:
            page = int(request.GET.get('page', 1))
            per_page = int(request.GET.get('per_page', 20))
            user_filter = request.GET.get('user_id')
            search = request.GET.get('search', '').strip()
            
            # Pornim cu toate modelele
            models_qs = UserModel.objects.all()
            if user_filter:
                models_qs = models_qs.filter(user__id=user_filter)
            
            # Dacă există căutare, aplicăm filtrarea manual
            if search:
                # Căutare după titlu (directă în MongoDB)
                by_title = list(models_qs.filter(title__icontains=search))
                # Căutare după username (prin Python, deoarece nu putem face join)
                all_for_user = list(models_qs)
                by_username = [m for m in all_for_user if m.user and search.lower() in m.user.username.lower()]
                # Combinăm, eliminând duplicatele
                combined_dict = {m.id: m for m in by_title}
                for m in by_username:
                    if m.id not in combined_dict:
                        combined_dict[m.id] = m
                models_list = list(combined_dict.values())
                total = len(models_list)
                # Paginare manuală
                start = (page - 1) * per_page
                end = start + per_page
                models = models_list[start:end]
            else:
                # Fără căutare, paginare directă
                total = models_qs.count()
                models = models_qs.order_by('-created_at').skip((page-1)*per_page).limit(per_page)
            
            data = []
            exports_dir = os.path.join(settings.MEDIA_ROOT, 'exports', 'user_exports')
            
            for m in models:
                # Verifică efectiv existența fișierului GLB pe disc
                glb_filename = os.path.join(exports_dir, f'{m.file_id}.glb')
                if not os.path.exists(glb_filename):
                    glb_filename = os.path.join(exports_dir, f'export_{m.file_id}.glb')
                has_glb = os.path.exists(glb_filename)
                
                data.append({
                    'id': str(m.id),
                    'file_id': m.file_id,
                    'title': m.title,
                    'is_public': m.is_public,
                    'created_at': m.created_at.isoformat(),
                    'total_elements': m.total_elements,
                    'file_size_mb': m.file_size_mb,
                    'public_view_count': m.public_view_count,
                    'download_count': m.download_count,
                    'has_glb_export': has_glb,  # ← bazat pe existența reală a fișierului
                    'user': {
                        'id': str(m.user.id) if m.user else None,
                        'username': m.user.username if m.user else 'Deleted'
                    }
                })
            return JsonResponse({'success': True, 'models': data, 'total': total, 'page': page, 'per_page': per_page})
        except Exception as e:
            import traceback
            traceback.print_exc()
            return JsonResponse({'success': False, 'error': str(e)}, status=500)
@csrf_exempt
@admin_required
def admin_model_delete(request, model_id):
    if request.method == 'DELETE':
        try:
            model = UserModel.objects.get(id=model_id)
            model.delete()
            return JsonResponse({'success': True, 'message': 'Model deleted'})
        except UserModel.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Model not found'}, status=404)


@csrf_exempt
@admin_required
def admin_model_toggle_visibility(request, model_id):
    if request.method == 'PATCH':
        try:
            model = UserModel.objects.get(id=model_id)
            model.is_public = not model.is_public
            model.save()
            return JsonResponse({'success': True, 'is_public': model.is_public})
        except UserModel.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Model not found'}, status=404)


def admin_panel(request):
    token = request.COOKIES.get('auth_token') or request.headers.get('Authorization', '').replace('Bearer ', '')
    if not token:
        return redirect('/auth/')
    try:
        auth_token = AuthToken.objects.get(token=token, expires_at__gt=timezone.now())
        if not auth_token.user.is_admin:
            return redirect('/')
        return render(request, 'admin_panel.html', {'user': auth_token.user})
    except AuthToken.DoesNotExist:
        return redirect('/auth/')
@never_cache
@admin_required
def get_admin_glb_file(request, file_id):
    """Endpoint special pentru admin - returnează GLB-ul oricărui model"""
    try:
        # 1. Caută modelul în baza de date
        user_model = UserModel.objects.filter(file_id=file_id).first()
        if not user_model:
            return JsonResponse({'success': False, 'error': 'Model not found'}, status=404)

        # 2. Caută fișierul în directorul standard de exporturi
        glb_filename = os.path.join(settings.MEDIA_ROOT, 'exports', 'user_exports', f'{file_id}.glb')
        if not os.path.exists(glb_filename):
            glb_filename = os.path.join(settings.MEDIA_ROOT, 'exports', 'user_exports', f'export_{file_id}.glb')

        if os.path.exists(glb_filename):
            response = FileResponse(open(glb_filename, 'rb'), content_type='model/gltf-binary')
            response['Cache-Control'] = 'public, max-age=3600'
            response['Content-Disposition'] = f'inline; filename="{file_id}.glb"'
            response['Access-Control-Allow-Origin'] = '*'
            return response

        # 3. Dacă nu, încearcă din câmpul glb_file (cale stocată în DB)
        if user_model.glb_file:
            candidate_path = os.path.join(settings.MEDIA_ROOT, user_model.glb_file)
            if os.path.exists(candidate_path):
                response = FileResponse(open(candidate_path, 'rb'), content_type='model/gltf-binary')
                response['Cache-Control'] = 'public, max-age=3600'
                response['Content-Disposition'] = f'inline; filename="{user_model.glb_file_name or file_id}.glb"'
                response['Access-Control-Allow-Origin'] = '*'
                return response

        # 4. Niciun fișier găsit
        return JsonResponse({'success': False, 'error': 'GLB file not found for this model'}, status=404)

    except Exception as e:
        print(f"Error serving GLB for admin: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': f'Server error: {str(e)}'}, status=500)


@csrf_exempt
@admin_required
def admin_models(request):
    if request.method == 'GET':
        try:
            page = int(request.GET.get('page', 1))
            per_page = int(request.GET.get('per_page', 20))
            user_filter = request.GET.get('user_id')
            search = request.GET.get('search', '').strip()

            models_qs = UserModel.objects.all()
            if user_filter:
                models_qs = models_qs.filter(user__id=user_filter)

            if search:
                # Căutare după titlu şi username (prin Python)
                by_title = list(models_qs.filter(title__icontains=search))
                all_for_user = list(models_qs)
                by_username = [m for m in all_for_user if m.user and search.lower() in m.user.username.lower()]
                combined_dict = {m.id: m for m in by_title}
                for m in by_username:
                    if m.id not in combined_dict:
                        combined_dict[m.id] = m
                models_list = list(combined_dict.values())
                total = len(models_list)
                start = (page - 1) * per_page
                end = start + per_page
                models = models_list[start:end]
            else:
                total = models_qs.count()
                models = models_qs.order_by('-created_at').skip((page-1)*per_page).limit(per_page)

            exports_dir = os.path.join(settings.MEDIA_ROOT, 'exports', 'user_exports')
            data = []
            for m in models:
                glb_filename = os.path.join(exports_dir, f'{m.file_id}.glb')
                if not os.path.exists(glb_filename):
                    glb_filename = os.path.join(exports_dir, f'export_{m.file_id}.glb')
                has_glb = os.path.exists(glb_filename)

                data.append({
                    'id': str(m.id),
                    'file_id': m.file_id,
                    'title': m.title,
                    'is_public': m.is_public,
                    'created_at': m.created_at.isoformat(),
                    'total_elements': m.total_elements,
                    'file_size_mb': m.file_size_mb,
                    'public_view_count': m.public_view_count,
                    'download_count': m.download_count,
                    'has_glb_export': has_glb,   # bazat pe existenţa reală a fişierului
                    'user': {
                        'id': str(m.user.id) if m.user else None,
                        'username': m.user.username if m.user else 'Deleted'
                    }
                })
            return JsonResponse({'success': True, 'models': data, 'total': total, 'page': page, 'per_page': per_page})
        except Exception as e:
            import traceback
            traceback.print_exc()
            return JsonResponse({'success': False, 'error': str(e)}, status=500)
@method_decorator(csrf_exempt, name='dispatch')
class AdminGraphQLView(GraphQLView):
    schema = schema

    def dispatch(self, request, *args, **kwargs):
        token = request.COOKIES.get('auth_token')
        if not token:
            auth_header = request.headers.get('Authorization', '')
            if auth_header.startswith('Bearer '):
                token = auth_header.split(' ')[1]
        if token:
            try:
                auth_token = AuthToken.objects.get(token=token, expires_at__gt=timezone.now())
                request.user = auth_token.user
            except AuthToken.DoesNotExist:
                pass
        return super().dispatch(request, *args, **kwargs)
    