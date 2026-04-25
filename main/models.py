# main/models.py - rescris pentru mongoengine
from mongoengine import Document, StringField, IntField, BooleanField, DateTimeField, ReferenceField, ListField, FloatField, DictField, ImageField, FileField
from django.contrib.auth.hashers import make_password, check_password
import secrets
import uuid
import os
from django.utils import timezone

def user_profile_picture_path(instance, filename):
    ext = filename.split('.')[-1]
    filename = f"profile_{instance.id}.{ext}"
    return os.path.join('users', str(instance.id), 'profile_pictures', filename)

def user_export_path(instance, filename):
    return os.path.join('exports', f'user_{instance.user.id}', filename)

def user_thumbnail_path(instance, filename):
    return os.path.join('users', str(instance.user.id), 'thumbnails', filename)

class User(Document):
    id = StringField(primary_key=True, default=lambda: str(uuid.uuid4()))
    username = StringField(max_length=50, unique=True, required=True)
    email = StringField(max_length=255, unique=True, required=True)
    password = StringField(max_length=128, required=True)
    profile_picture = StringField()  # URL sau cale
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
    favorites = ListField(ReferenceField(User))
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

    def is_favorited_by(self, user):
        return user in self.favorites

    def get_favorites_count(self):
        return len(self.favorites)