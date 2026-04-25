from django.shortcuts import render
from django.http import JsonResponse, HttpResponse, FileResponse
import json
import requests
import os
import uuid
import time
import threading
import io
import base64
import zipfile
import traceback
from urllib.parse import urlencode
from io import BytesIO
from PIL import Image, ImageDraw
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.clickjacking import xframe_options_exempt
from django.views.decorators.cache import never_cache
from django.contrib.auth.hashers import make_password, check_password
from django.utils import timezone
from datetime import timedelta
import secrets
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q, F
from pymongo import MongoClient
from .models import User, AuthToken, UserModel
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi

def Intro(request):
    return render(request, 'Intro.html')

def home(request):
    return render(request, 'home.html')

def view_3d(request, file_id=None):
    context = {
        'file_id': file_id or 'demo'
    }
    return render(request, 'view_3d.html', context)

def workshop_page(request):
    return render(request, 'workshop.html')

def auth_page(request):
    return render(request, 'auth.html')

def service_worker_root(request):
    content = """
    const CACHE_NAME = 'elmc3d-v1.0.0';
    const STATIC_CACHE = 'static-v1';
    const DYNAMIC_CACHE = 'dynamic-v1';
    
    const STATIC_ASSETS = [
        '/',
        '/home/',
        '/auth/',
        '/account/',
        '/workshop/',
    ];
    
    self.addEventListener('install', event => {
        event.waitUntil(
            caches.open(STATIC_CACHE)
                .then(cache => {
                    return cache.addAll(STATIC_ASSETS);
                })
                .then(() => {
                    return self.skipWaiting();
                })
        );
    });
    
    self.addEventListener('activate', event => {
        event.waitUntil(
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                return self.clients.claim();
            })
        );
    });
    
    self.addEventListener('fetch', event => {
        const url = new URL(event.request.url);
        
        if (event.request.method !== 'GET') {
            return;
        }
        
        
        if (url.pathname.includes('/media/models/') || url.pathname.includes('.glb') || url.pathname.includes('.gltf')) {
            event.respondWith(
                caches.match(event.request)
                    .then(cachedResponse => {
                        
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        
                        
                        return fetch(event.request)
                            .then(networkResponse => {
                                
                                const responseClone = networkResponse.clone();
                                
                                
                                event.waitUntil(
                                    caches.open(DYNAMIC_CACHE)
                                        .then(cache => {
                                            return cache.put(event.request, responseClone);
                                        })
                                );
                                
                                return networkResponse;
                            })
                            .catch(() => {
                                
                                return new Response('Model not available offline', {
                                    status: 404,
                                    headers: { 'Content-Type': 'text/plain' }
                                });
                            });
                    })
            );
            return;
        }
        if (url.pathname.includes('/api/') || url.pathname.includes('/auth/')) {
            event.respondWith(
                fetch(event.request)
                    .then(networkResponse => {
                        return networkResponse;
                    })
                    .catch(() => {
                        return new Response(JSON.stringify({
                            error: 'You are offline',
                            message: 'Please check your internet connection'
                        }), {
                            headers: { 'Content-Type': 'application/json' }
                        });
                    })
            );
            return;
        }
        
        event.respondWith(
            caches.match(event.request)
                .then(cachedResponse => {
                    if (cachedResponse) {
                        const fetchPromise = fetch(event.request)
                            .then(networkResponse => {
                                if (networkResponse.status === 200) {
                                    try {
                                        const responseClone = networkResponse.clone();
                                        event.waitUntil(
                                            caches.open(DYNAMIC_CACHE)
                                                .then(cache => cache.put(event.request, responseClone))
                                        );
                                    } catch (cloneError) {
                                        console.warn('Could not clone response for caching:', cloneError);
                                    }
                                }
                            })
                            .catch(() => {
                                
                            });
                        
                        event.waitUntil(fetchPromise);
                        return cachedResponse;
                    }
                    
                    return fetch(event.request)
                        .then(networkResponse => {
                            
                            if (networkResponse.status === 200) {
                                try {
                                    const responseClone = networkResponse.clone();
                                    event.waitUntil(
                                        caches.open(DYNAMIC_CACHE)
                                            .then(cache => cache.put(event.request, responseClone))
                                    );
                                } catch (cloneError) {
                                    console.warn('Could not clone response for caching:', cloneError);
                                }
                            }
                            return networkResponse;
                        })
                        .catch(() => {
                            
                            if (event.request.headers.get('accept').includes('text/html')) {
                                return new Response(
                                    '<html><body style="background:#0f172a;color:white;padding:20px;text-align:center"><h1>ELMC 3D</h1><p>You are offline. Please check your internet connection.</p><a href="/" style="color:#667eea">Refresh</a></body></html>',
                                    { 
                                        headers: { 
                                            'Content-Type': 'text/html',
                                            'Cache-Control': 'no-cache'
                                        } 
                                    }
                                );
                            }
                        });
                })
        );
    });
    
    self.addEventListener('message', event => {
        if (event.data && event.data.type === 'CLEAR_CACHE') {
            caches.delete(DYNAMIC_CACHE)
                .then(() => {
                    event.ports[0].postMessage({ success: true });
                });
        }
        
        if (event.data && event.data.type === 'GET_CACHE_INFO') {
            caches.open(DYNAMIC_CACHE)
                .then(cache => cache.keys())
                .then(keys => {
                    event.ports[0].postMessage({
                        cacheSize: keys.length,
                        cachedItems: keys.map(req => req.url)
                    });
                });
        }
    });
    """
    
    response = HttpResponse(content, content_type='application/javascript')
    response['Cache-Control'] = 'no-cache'
    response['Service-Worker-Allowed'] = '/'
    return response


def service_worker(request):
    possible_paths = [
        os.path.join(settings.BASE_DIR, 'static', 'pwa', 'serviceworker.js'),
        os.path.join(settings.BASE_DIR, 'main', 'static', 'pwa', 'serviceworker.js'),
        os.path.join(settings.BASE_DIR, 'serviceworker.js'),
    ]
    
    for sw_path in possible_paths:
        if os.path.exists(sw_path):
            print(f"Service worker found at: {sw_path}")
            with open(sw_path, 'r') as file:
                content = file.read()
            response = HttpResponse(content, content_type='application/javascript')
            response['Cache-Control'] = 'no-cache'
            response['Service-Worker-Allowed'] = '/'
            return response
    return HttpResponse(content_type='application/javascript')

def manifest_json(request):
    manifest_path = os.path.join(settings.BASE_DIR, 'static', 'pwa', 'manifest.json')
    with open(manifest_path, 'r') as file:
        content = file.read()
    
    return HttpResponse(content, content_type='application/manifest+json')

def offline_view(request):
    return render(request, 'offline.html')



def token_required(view_func):
    def wrapper(request, *args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        if not token:
            return JsonResponse({
                'success': False,
                'error': 'Authentication token required'
            }, status=401)
        
        try:
            auth_token = AuthToken.objects.get(token=token, expires_at__gt=timezone.now())
            request.user = auth_token.user
            return view_func(request, *args, **kwargs)
        except AuthToken.DoesNotExist:
            return JsonResponse({
                'success': False,
                'error': 'Invalid or expired token'
            }, status=401)
    
    return wrapper

def account_page(request):
    return render(request, 'account.html')

@csrf_exempt
@token_required
def update_profile(request):
    if request.method == 'PUT':
        try:
            user = request.user
            data = request.POST.dict()
            
            if 'profile_picture' in request.FILES:
                profile_picture = request.FILES['profile_picture']
                if user.profile_picture:
                    user.profile_picture.delete(save=False)
                user.profile_picture = profile_picture
            
            if 'username' in data and data['username']:
                new_username = data['username'].strip()
                if new_username != user.username:
                    if User.objects.filter(username=new_username).count() > 0:
                        return JsonResponse({
                            'success': False,
                            'error': 'The username is already taken'
                        }, status=400)
                    user.username = new_username
            
            if 'email' in data and data['email']:
                new_email = data['email'].strip().lower()
                if new_email != user.email:
                    if User.objects.filter(email=new_email).exclude(id=user.id).count() > 0:
                        return JsonResponse({
                            'success': False,
                            'error': 'The email address is already registered'
                        }, status=400)
                    user.email = new_email
            
            user.save()
            
            return JsonResponse({
                'success': True,
                'message': 'Profile updated successfully',
                'user': {
                    'id': str(user.id),
                    'username': user.username,
                    'email': user.email,
                    'profile_picture': user.get_profile_picture_url(),
                    'models_count': user.models_count
                }
            })
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'error': f'Error updating profile: {str(e)}'
            }, status=500)
    
    return JsonResponse({
        'success': False,
        'error': 'Only the PUT method is allowed'
    }, status=405)

@csrf_exempt
@token_required
def change_password(request):
    if request.method == 'PUT':
        try:
            data = json.loads(request.body)
            user = request.user
            current_password = data.get('current_password')
            new_password = data.get('new_password')
            
            if not current_password or not new_password:
                return JsonResponse({
                    'success': False,
                    'error': 'All fields are required'
                }, status=400)
            
            if not user.check_password(current_password):
                return JsonResponse({
                    'success': False,
                    'error': 'The current password is incorrect'
                }, status=400)
            
            if len(new_password) < 6:
                return JsonResponse({
                    'success': False,
                    'error': 'The new password must be at least 6 characters long'
                }, status=400)
            
            user.set_password(new_password)
            user.save()
            
            AuthToken.objects.filter(user=user).delete()
            
            return JsonResponse({
                'success': True,
                'message': 'The password has been changed successfully. Please sign in again.'
            })
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'error': f'Error changing the password: {str(e)}'
            }, status=500)
    
    return JsonResponse({
        'success': False,
        'error': 'Only the PUT method is allowed'
    }, status=405)

@token_required
def get_user_models(request):
    try:
        user = request.user
        
        models = []
        
        return JsonResponse({
            'success': True,
            'models': models,
            'total': len(models),
            'message': 'Your model collection will be available soon'
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error loading models: {str(e)}'
        }, status=500)


def get_building_data(request, file_id):
    try:
        try:
            user_model = UserModel.objects.filter(file_id=file_id).first()
            if user_model and user_model.has_glb_export:
                return JsonResponse({
                    'success': True,
                    'file_id': file_id,
                    'file_type': 'glb',
                    'message': 'The GLB file is available in the database',
                    'download_url': f'/api/glb-file/{file_id}/',
                    'has_json': False, 
                    'project_info': {
                        'title': user_model.title,
                        'description': user_model.description,
                        'element_count': user_model.total_elements,
                        'created_at': user_model.created_at.isoformat() if user_model.created_at else None
                    }
                })
        except Exception as e:
            print(f"Error checking the UserModel: {str(e)}")

        json_filename = os.path.join(settings.MEDIA_ROOT, 'models', f'{file_id}.json')
        
        if os.path.exists(json_filename):
            return JsonResponse({
                'success': True,
                'file_id': file_id,
                'file_type': 'json',
                'message': 'The JSON file is available',
                'download_url': f'/api/download/{file_id}.json',
                'has_json': True 
            })

        return JsonResponse({
            'success': False,
            'error': 'The file was not found',
            'message': f'No data found for file_id: {file_id}',
            'suggestions': [
                'The project can only be in GLB format',
                'Check if the project exists in your account'
            ]
        }, status=404)
            
    except Exception as e:
        print(f"Error loading data: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': str(e),
            'message': 'Error loading data'
        }, status=500)
@token_required
def get_project_file_id(request, file_id=None):
    try:
        user = request.user
        
        if file_id:
            user_model = UserModel.objects.filter(user=user, file_id=file_id).first()
            
            if user_model:
                return JsonResponse({
                    'success': True,
                    'file_id': file_id,
                    'exists': True,
                    'project_name': user_model.title
                })
            else:
                return JsonResponse({
                    'success': True,
                    'file_id': file_id,
                    'exists': False
                })
        else:
            new_file_id = f"project_{uuid.uuid4().hex[:12]}"
            return JsonResponse({
                'success': True,
                'file_id': new_file_id,
                'exists': False
            })
            
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@csrf_exempt
@token_required
def update_project_name(request, file_id):
    if request.method == 'POST':
        try:
            user = request.user
            data = json.loads(request.body)
            project_name = data.get('project_name', '').strip()
            
            if not project_name:
                return JsonResponse({
                    'success': False,
                    'error': 'The project name is required'
                }, status=400)
            
            user_model = UserModel.objects.filter(user=user, file_id=file_id).first()
            
            if not user_model:
                return JsonResponse({
                    'success': False,
                    'error': 'The project was not found'
                }, status=404)
            
            user_model.title = project_name
            user_model.save()
            
            return JsonResponse({
                'success': True,
                'message': 'The project name has been updated',
                'project_name': project_name
            })
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'error': str(e)
            }, status=500)
    
    return JsonResponse({
        'success': False,
        'error': 'Only the POST method is allowed'
    }, status=405)
    
@csrf_exempt
def save_building_data(request):
    if request.method == 'POST':
        try:
            start_time = time.time()
            
            raw_data = request.body.decode('utf-8')
            data = json.loads(raw_data)
            
            file_id = data.get('file_id', f"buildings_{uuid.uuid4().hex[:8]}")
            
            data_type = data.get('dataType', 'building')
            
            if data_type == 'export_glb':
                file_id = data.get('file_id')
                if not file_id:
                    return JsonResponse({
                        'success': False,
                        'error': 'The File ID is required to update the existing project'
                    }, status=400)
                
                user = None
                token = request.headers.get('Authorization', '').replace('Bearer ', '')
                if token:
                    try:
                        auth_token = AuthToken.objects.get(token=token, expires_at__gt=timezone.now())
                        user = auth_token.user
                        
                        user_model, created = UserModel.objects.update_or_create(
                            user=user,
                            file_id=file_id,
                            defaults={
                                'title': f"Model {file_id}",
                                'description': f"Model 3D",
                                'glb_export_time': timezone.now(),
                                'updated_at': timezone.now(),
                                'has_glb_export': True,
                                'glb_file_name': f"{file_id}.glb",  
                                'is_public': False
                            }
                        )
                        
                            
                    except AuthToken.DoesNotExist:
                        pass
                
                glb_data = None
                if 'glb_data' in data:
                    try:
                        glb_data = base64.b64decode(data['glb_data'])
                        
                        if glb_data and len(glb_data) > 0:
                            success, glb_path = save_glb_file(file_id, glb_data, user)
                            if success:
                                
                                processing_time = time.time() - start_time
                                
                                response_data = {
                                    'success': True,
                                    'file_id': file_id,
                                    'message': 'GLB export saved successfully',
                                    'processing_time': f'{processing_time:.2f}s',
                                    'glb_only': True,  
                                    'note': 'Only the GLB file was saved'
                                }
                                
                               
                                if user:
                                    response_data['saved_to_account'] = True
                                    response_data['user'] = {
                                        'username': user.username,
                                        'models_count': user.models_count
                                    }
                                
                                return JsonResponse(response_data)
                            else:
                                return JsonResponse({
                                    'success': False,
                                    'error': 'Error saving the GLB',
                                    'message': 'The GLB could not be saved'
                                }, status=500)
                        else:
                            return JsonResponse({
                                'success': False,
                                'error': 'Invalid GLB data',
                                'message': 'The GLB data is empty or invalid'
                            }, status=400)
                            
                    except Exception as e:
                        print(f" Error processing the GLB: {str(e)}")
                        return JsonResponse({
                            'success': False,
                            'error': f'Error processing the GLB: {str(e)}',
                            'message': 'Error processing the GLB data'
                        }, status=400)
                else:
                    return JsonResponse({
                        'success': False,
                        'error': 'The GLB data is missing',
                        'message': 'For GLB export, the GLB data is required'
                    }, status=400)
            
            building_data = {
                'file_id': file_id,
                'geojson': data.get('geojson', {}),
                'bounds': data.get('bounds', {}),
                'origin': data.get('origin', [0, 0]),
                'dataType': data_type,
                'timestamp': data.get('timestamp'),
                'building_count': len(data.get('geojson', {}).get('features', []))
            }
            
            
            user = None
            token = request.headers.get('Authorization', '').replace('Bearer ', '')
            if token:
                try:
                    auth_token = AuthToken.objects.get(token=token, expires_at__gt=timezone.now())
                    user = auth_token.user
                except AuthToken.DoesNotExist:
                    pass
            
            glb_data = None
            if 'glb_data' in data:
                try:
                    glb_data = base64.b64decode(data['glb_data'])
                except Exception as e:
                    print(f"Error decoding the GLB: {str(e)}")
            
            def save_to_file():
                try:
                    models_dir = os.path.join(settings.MEDIA_ROOT, 'models')
                    os.makedirs(models_dir, exist_ok=True)
                    
                    json_filename = os.path.join(models_dir, f'{file_id}.json')
                    
                    with open(json_filename, 'w', encoding='utf-8') as f:
                        json.dump(building_data, f, separators=(',', ':'), ensure_ascii=False)
                    
                    file_size = os.path.getsize(json_filename)
                    
                    if glb_data and len(glb_data) > 0 and data_type != 'export_glb':
                        success, glb_path = save_glb_file(file_id, glb_data, user)
                    
                    if user:
                        with transaction.atomic():
                            element_types = {
                                'building': 0,
                                'highway': 0, 
                                'water': 0,
                                'natural': 0,
                                'landuse': 0,
                                'other': 0
                            }
                            
                            for feature in building_data['geojson'].get('features', []):
                                props = feature.get('properties', {})
                                element_type = 'other'
                                if props.get('building'):
                                    element_type = 'building'
                                elif props.get('highway'):
                                    element_type = 'highway'
                                elif props.get('waterway') or props.get('natural') == 'water':
                                    element_type = 'water'
                                elif props.get('natural'):
                                    element_type = 'natural'
                                elif props.get('landuse'):
                                    element_type = 'landuse'
                                
                                element_types[element_type] += 1
                            
                            total_area = 0
                            bounds_list = building_data.get('bounds', [])
                            for bounds in bounds_list:
                                lat_diff = bounds.get('north', 0) - bounds.get('south', 0)
                                lng_diff = bounds.get('east', 0) - bounds.get('west', 0)
                                total_area += (lat_diff * lng_diff * 111.32 * 111.32)
                            
                            user_model, created = UserModel.objects.update_or_create(
                                user=user,
                                file_id=file_id,
                                defaults={
                                    'title': f"Model {file_id}",
                                    'description': f"Model 3D generat automat cu {building_data['building_count']} elemente",
                                    'total_elements': building_data['building_count'],
                                    'building_count': element_types['building'],
                                    'highway_count': element_types['highway'],
                                    'water_count': element_types['water'],
                                    'natural_count': element_types['natural'],
                                    'landuse_count': element_types['landuse'],
                                    'other_count': element_types['other'],
                                    'area_km2': total_area,
                                    'file_size_mb': round(file_size / (1024 * 1024), 2),
                                    'updated_at': timezone.now(),
                                    'has_glb_export': bool(glb_data and len(glb_data) > 0 and data_type != 'export_glb'),
                                    'is_public': False
                                }
                            )

                            
                          
                            user.models_count = UserModel.objects.filter(user=user).count()
                            user.last_model_created = timezone.now()
                            user.save()
                    
                except Exception as e:
                    print(f"Error saving in thread: {str(e)}")
                    import traceback
                    traceback.print_exc()
            
            save_thread = threading.Thread(target=save_to_file)
            save_thread.daemon = True
            save_thread.start()
            
            processing_time = time.time() - start_time
            
            response_data = {
                'success': True,
                'file_id': file_id,
                'message': f'The data has been saved successfully ({building_data["building_count"]} elemets)',
                'building_count': building_data['building_count'],
                'data_type': building_data['dataType'],
                'processing_time': f'{processing_time:.2f}s',
                'note': 'The file is being saved',
                'glb_saved': bool(glb_data) 
            }
            
            if user:
                response_data['saved_to_account'] = True
                response_data['user'] = {
                    'username': user.username,
                    'models_count': user.models_count
                }
            
            return JsonResponse(response_data)
            
        except Exception as e:
            print(f"Critical error during save: {str(e)}")
            import traceback
            traceback.print_exc()
            
            return JsonResponse({
                'success': False,
                'error': str(e),
                'message': 'Error saving the data'
            }, status=400)
    
    return JsonResponse({
        'success': False,
        'error': 'Method not allowed',
        'message': 'Only the POST method is allowed'
    }, status=405)

def download_building_data(request, file_id):
    try:
        json_filename = os.path.join(settings.MEDIA_ROOT, 'models', f'{file_id}.json')
        
        if os.path.exists(json_filename):
            response = HttpResponse(content_type='application/json')
            response['Content-Disposition'] = f'attachment; filename="{file_id}.json"'
            
            with open(json_filename, 'rb') as f:
                while True:
                    chunk = f.read(8)
                    if not chunk:
                        break
                    response.write(chunk)
            
            return response
        else:
            return JsonResponse({
                'success': False,
                'error': 'The file was not found'
            }, status=404)
            
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@csrf_exempt
def export_glb(request, file_id):
    try:
        response = HttpResponse(content_type='model/gltf-binary')
        response['Content-Disposition'] = f'attachment; filename="elements_{file_id}.glb"'
        
        info_message = {
            'file_id': file_id,
            'timestamp': time.time()
        }
        
        response.write(json.dumps(info_message).encode())
        return response
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e),
            'message': 'Error generating the GLB file'
        }, status=500)

def download_file(request, filename):
    try:
        possible_paths = [
            os.path.join(settings.MEDIA_ROOT, 'exports', filename),
            os.path.join(settings.MEDIA_ROOT, 'models', filename),
        ]
        
        file_path = None
        for path in possible_paths:
            if os.path.exists(path):
                file_path = path
                break
        
        if not file_path:
            return JsonResponse({
                'success': False,
                'error': 'The file was not found'
            }, status=404)
        
        if filename.endswith('.glb'):
            content_type = 'model/gltf-binary'
        elif filename.endswith('.json'):
            content_type = 'application/json'
        else:
            content_type = 'application/octet-stream'
        
        response = HttpResponse(content_type=content_type)
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        
        with open(file_path, 'rb') as f:
            while True:
                chunk = f.read(8192)
                if not chunk:
                    break
                response.write(chunk)
        
        return response
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

def clear_building_data(request):
    return JsonResponse({
        'success': True,
        'message': 'The system manages the storage automatically'
    })

def get_session_info(request):
    return JsonResponse({
        'session_exists': 'building_data' in request.session,
        'storage_system': 'file_based_optimized',
        'max_file_size': 'unlimited'
    })

def health_check(request):
    return JsonResponse({
        'status': 'healthy', 
        'service': 'cadmapper_3d_optimized',
        'timestamp': time.time(),
        'version': '2.1.0',
        'features': 'multiple_element_types',
        'max_buildings': 'unlimited',
        'max_file_size': 'unlimited'
    })

def element_texture(request):
    try:
        texture_name = request.GET.get('texture', 'default')
        face_type = request.GET.get('face', 'top')
        element_type = request.GET.get('type', 'building')
        
        
        if texture_name == 'default':
            texture_mapping = {
                'building': {
                    'top': 'Concrete048_1K-JPG_Color',     
                    'aside': 'Facade020A_1K-JPG_Color',    
                    'side': 'Concrete048_1K-JPG_Color',   
                    'bottom': 'Concrete048_1K-JPG_Color', 
                    'default': 'Concrete048_1K-JPG_Color'
                },
                'highway': {
                    'top': 'Asphalt005_1K_Color',         
                    'aside': 'Asphalt005_1K_Color',       
                    'side': 'Concrete048_1K-JPG_Color',   
                    'bottom': 'Ground025_1K_Color',      
                    'default': 'Asphalt005_1K_Color'
                },
                'water': {
                    'top': 'WaterSurface009_1K_Color',    
                    'aside': 'WaterSurface010_1K_Color',  
                    'side': 'WaterSurface011_1K_Color',   
                    'bottom': 'Ground037_1K_Color',       
                    'default': 'WaterSurface009_1K_Color'
                },
                'natural': {
                    'top': 'Grass015_1K_Color',           
                    'aside': 'Forest004_1K_Color',       
                    'side': 'Rock022_1K_Color',           
                    'bottom': 'Ground025_1K_Color',      
                    'default': 'Grass015_1K_Color'
                },
                'landuse': {
                    'top': 'Ground025_1K_Color',          
                    'aside': 'Ground037_1K_Color',       
                    'side': 'Concrete048_1K-JPG_Color',   
                    'bottom': 'Ground025_1K_Color',      
                    'default': 'Ground025_1K_Color'
                },
                'other': {
                    'top': 'Metal032_1K_Color',           
                    'aside': 'Plastic013_1K_Color',       
                    'side': 'Wood049_1K_Color',           
                    'bottom': 'Concrete048_1K-JPG_Color',
                    'default': 'Metal032_1K_Color'
                }
            }
            
            element_textures = texture_mapping.get(element_type, {})
            texture_name = element_textures.get(face_type, element_textures.get('default', 'Bricks043_1K_Color'))
        
        texture_path, found_filename, found_ext = find_texture_file(texture_name)
        
        if not texture_path or not os.path.exists(texture_path):
            
            fallback_textures = [
                texture_name,
                texture_name.replace('-JPG_Color', ''),
                texture_name.replace('_1K', ''),
                texture_name.replace('-JPG', ''),
                'Concrete048_1K-JPG_Color',
                'Bricks043_1K_Color', 
                'Asphalt005_1K_Color'
            ]
            
            for fallback in fallback_textures:
                texture_path, found_filename, found_ext = find_texture_file(fallback)
                if texture_path and os.path.exists(texture_path):
                    break
            
            if not texture_path:
                return JsonResponse({
                    'success': False,
                    'error': f'Texture {texture_name} was not found',
                    'available_textures': get_available_textures_list()
                }, status=404)
        
        
        with open(texture_path, 'rb') as f:
            image_data = f.read()
        
        if found_filename.lower().endswith('.jpg') or found_filename.lower().endswith('.jpeg'):
            content_type = 'image/jpeg'
        elif found_filename.lower().endswith('.png'):
            content_type = 'image/png'
        else:
            content_type = 'image/jpeg'  
        
        django_response = HttpResponse(image_data, content_type=content_type)
        django_response['Cache-Control'] = 'public, max-age=86400' 
        django_response['X-Texture-Info'] = f'original:{found_filename};element:{element_type};face:{face_type}'
        return django_response
            
    except Exception as e:
        print(f"Error serving texture {texture_name}: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': str(e),
            'message': 'Internal error while serving the texture'
        }, status=500)

def available_textures(request):
    try:
        textures_dir = os.path.join(settings.BASE_DIR, 'textures')
        
        if not os.path.exists(textures_dir):
            return JsonResponse({
                'success': False,
                'error': 'The textures folder does not exist'
            }, status=404)
        
        texture_files = []
        supported_formats = ['.jpg', '.jpeg', '.png', '.webp']
        
        for filename in os.listdir(textures_dir):
            if any(filename.lower().endswith(ext) for ext in supported_formats):
                texture_path = os.path.join(textures_dir, filename)
                
                thumbnail_url = f'/api/element-texture/?texture={filename}&face=top'
                
                texture_files.append({
                    'name': os.path.splitext(filename)[0],
                    'filename': filename,
                    'url': f'/api/element-texture/?texture={filename}&face=top',
                    'thumbnail': thumbnail_url,
                    'category': self.get_texture_category(filename)
                })
        
        return JsonResponse({
            'success': True,
            'textures': texture_files,
            'total': len(texture_files)
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

def get_texture_category(filename):
    filename_lower = filename.lower()
    
    if any(word in filename_lower for word in ['brick', 'wall', 'facade', 'concrete']):
        return 'building'
    elif any(word in filename_lower for word in ['asphalt', 'road', 'pavement']):
        return 'road'
    elif any(word in filename_lower for word in ['water', 'river', 'lake']):
        return 'water'
    elif any(word in filename_lower for word in ['grass', 'forest', 'tree', 'rock']):
        return 'natural'
    elif any(word in filename_lower for word in ['ground', 'dirt', 'sand']):
        return 'landuse'
    else:
        return 'other'


def find_texture_file(texture_name):

    textures_dir = os.path.join(settings.BASE_DIR, 'textures')
    
    exact_path_jpg = os.path.join(textures_dir, f"{texture_name}.jpg")
    exact_path_jpeg = os.path.join(textures_dir, f"{texture_name}.jpeg")
    exact_path_png = os.path.join(textures_dir, f"{texture_name}.png")
    
    if os.path.exists(exact_path_jpg):
        return exact_path_jpg, f"{texture_name}.jpg", "jpg"
    elif os.path.exists(exact_path_jpeg):
        return exact_path_jpeg, f"{texture_name}.jpeg", "jpeg"
    elif os.path.exists(exact_path_png):
        return exact_path_png, f"{texture_name}.png", "png"
    
    for filename in os.listdir(textures_dir):
        if texture_name.lower() in filename.lower():
            file_path = os.path.join(textures_dir, filename)
            if any(filename.lower().endswith(ext) for ext in ['.jpg', '.jpeg', '.png']):
                ext = filename.split('.')[-1].lower()
                return file_path, filename, ext
    
    return None, None, None

def convert_to_png_if_needed(image_path, output_format='PNG'):
    try:
        with Image.open(image_path) as img:
            if img.mode in ('RGBA', 'LA'):
                background = Image.new('RGBA', img.size, (255, 255, 255, 255))
                background.paste(img, mask=img.split()[-1])
                img = background.convert('RGBA')
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            buffer = io.BytesIO()
            img.save(buffer, format=output_format, optimize=True)
            buffer.seek(0)
            return buffer.getvalue()
            
    except Exception as e:
        print(f"Error converting the image {image_path}: {str(e)}")
        raise e



def get_available_textures_list():
    textures_dir = os.path.join(settings.BASE_DIR, 'textures')
    
    if not os.path.exists(textures_dir):
        return []
    
    textures = []
    supported_formats = ['.jpg', '.jpeg', '.png']
    
    for filename in os.listdir(textures_dir):
        if any(filename.lower().endswith(ext) for ext in supported_formats):
            name_without_ext = os.path.splitext(filename)[0]
            textures.append({
                'name': name_without_ext,
                'filename': filename,
                'url': f'/api/element-texture/?texture={name_without_ext}',
                'thumbnail': f'/api/element-texture/?texture={name_without_ext}&face=top',
                'category': get_texture_category(filename)
            })
    
    return textures

def available_textures(request):
    try:
        textures = get_available_textures_list()
        
        grouped_textures = {}
        for texture in textures:
            first_word = texture['name'].split('_')[0]  
            if first_word not in grouped_textures:
                grouped_textures[first_word] = []
            grouped_textures[first_word].append(texture)
        
        sorted_groups = dict(sorted(grouped_textures.items()))
        
        return JsonResponse({
            'success': True,
            'textures': textures, 
            'grouped_textures': sorted_groups,
            'total': len(textures),
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@csrf_exempt
def export_project(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            file_id = data.get('file_id', f"project_{uuid.uuid4().hex[:8]}")
            
            project_data = {
                'file_id': file_id,
                'project_name': data.get('project_name', 'Unnamed Project'),
                'description': data.get('description', ''),
                'elements_count': data.get('elements_count', 0),
                'scene_data': data.get('scene_data', {}),
                'metadata': data.get('metadata', {}),
                'timestamp': time.time(),
                'version': '1.0.0'
            }
            
            projects_dir = os.path.join(settings.MEDIA_ROOT, 'projects')
            os.makedirs(projects_dir, exist_ok=True)
            
            project_filename = os.path.join(projects_dir, f'{file_id}.json')
            with open(project_filename, 'w', encoding='utf-8') as f:
                json.dump(project_data, f, indent=2, ensure_ascii=False)
            
            return JsonResponse({
                'success': True,
                'file_id': file_id,
                'project_name': project_data['project_name'],
                'download_url': f'/api/download/{file_id}.json',
                'message': 'Project saved successfully'
            })
            
        except Exception as e:
            print(f"Error saving the project: {str(e)}")
            return JsonResponse({
                'success': False,
                'error': str(e),
                'message': 'Error saving the project'
            }, status=500)
    
    return JsonResponse({
        'success': False,
        'error': 'Method not allowed'
    }, status=405)

def user_projects(request):
    return JsonResponse({
        'success': True,
        'projects': [],
        'message': 'The project system will be implemented in the next version with authentication',
        'future_feature': 'user_authentication_and_project_management'
    })

@csrf_exempt
def register_user(request):
    if request.method == 'POST':
        try:
            print(" Register endpoint called")
            data = json.loads(request.body)
            username = data.get('username', '').strip()
            email = data.get('email', '').strip().lower()
            password = data.get('password', '')
            
            
            if not username or not email or not password:
                return JsonResponse({
                    'success': False,
                    'error': 'All fields are required'
                }, status=400)
            
            if len(password) < 6:
                return JsonResponse({
                    'success': False,
                    'error': 'The password must be at least 6 characters long'
                }, status=400)
            if User.objects.filter(username=username).count() > 0:
                return JsonResponse({
                    'success': False,
                    'error': 'The username is already taken'
                }, status=400)
            
            if User.objects.filter(email=email).count() > 0:
                return JsonResponse({
                    'success': False,
                    'error': 'The email address is already registered'
                }, status=400)
            user = User(
                username=username,
                email=email
            )
            user.set_password(password)
            user.save()
            
            token = AuthToken(
                user=user,
                expires_at=timezone.now() + timedelta(days=30)
            )
            token.save()
            return JsonResponse({
                'success': True,
                'message': 'Account created successfully!',
                'user': {
                    'id': str(user.id),
                    'username': user.username,
                    'email': user.email
                },
                'token': token.token,
                'expires_at': token.expires_at.isoformat()
            })
            
        except Exception as e:
            print(f" ERROR in register: {str(e)}")
            import traceback
            traceback.print_exc()
            
            return JsonResponse({
                'success': False,
                'error': f'Registration error: {str(e)}'
            }, status=500)
    
    return JsonResponse({
        'success': False,
        'error': 'Only the POST method is allowed'
    }, status=405)

@csrf_exempt
def login_user(request):
    if request.method == 'POST':
        try:
            print(" Login endpoint called")
            data = json.loads(request.body)
            email = data.get('email', '').strip().lower()
            password = data.get('password', '')
            
            
            if not email or not password:
                return JsonResponse({
                    'success': False,
                    'error': 'Email and password are required'
                }, status=400)
            
            try:
                users = User.objects.filter(email=email)
                user = None
                
                for u in users:
                    if u.is_active:
                        user = u
                        break
                
                if not user:
                    return JsonResponse({
                        'success': False,
                        'error': 'Incorrect email or password'
                    }, status=401)
                    
                
            except Exception as db_error:
                print(f" Database error: {str(db_error)}")
                try:
                    user = User.objects.get(email=email)
                    if not user.is_active:
                        return JsonResponse({
                            'success': False,
                            'error': 'The account is deactivated'
                        }, status=401)
                except User.DoesNotExist:
                    return JsonResponse({
                        'success': False,
                        'error': 'Incorrect email or password'
                    }, status=401)
            
            password_valid = user.check_password(password)
            
            if not password_valid:
                return JsonResponse({
                    'success': False,
                    'error': 'Incorrect email or password'
                }, status=401)
            
            old_tokens_count = AuthToken.objects.filter(user=user).count()
            AuthToken.objects.filter(user=user).delete()
            
            token = AuthToken(
                user=user,
                expires_at=timezone.now() + timedelta(days=30)
            )
            token.save()
            
            return JsonResponse({
                'success': True,
                'message': 'Login successful!',
                'user': {
                    'id': str(user.id),
                    'username': user.username,
                    'email': user.email,
                    'models_count': user.models_count
                },
                'token': token.token,
                'expires_at': token.expires_at.isoformat()
            })
            
        except Exception as e:
            print(f" ERROR in login: {str(e)}")
            import traceback
            traceback.print_exc()
            
            return JsonResponse({
                'success': False,
                'error': f'Authentication error: {str(e)}'
            }, status=500)
    
    return JsonResponse({
        'success': False,
        'error': 'Only the POST method is allowed'
    }, status=405)
@csrf_exempt
def proxy_overpass(request):
    if request.method == 'OPTIONS':
        response = HttpResponse()
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response['Access-Control-Allow-Headers'] = 'Content-Type, Accept'
        return response
    
    if request.method == 'POST':
        try:
            query = request.body.decode('utf-8')
            headers = {
                'Content-Type': 'text/plain',
                'Accept': '*/*',
                'User-Agent': 'curl/8.0.0'
            }
            
            response = requests.post(
                'https://overpass-api.de/api/interpreter',
                data=query,
                headers=headers,
                timeout=60
            )
            if response.status_code == 200:
                return HttpResponse(
                    response.content,
                    content_type='application/json'
                )
            else:
                return HttpResponse(
                    response.content,
                    status=response.status_code,
                    content_type='text/plain'
                )
            
        except Exception as e:
            print(f"Error: {e}")
            return JsonResponse({'error': str(e)}, status=500)
    
    return JsonResponse({'error': 'Method not allowed'}, status=405)

def get_user_profile(request):
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    
    if not token:
        return JsonResponse({
            'success': False,
            'error': 'Authentication token required'
        }, status=401)
    
    try:
        auth_token = AuthToken.objects.get(token=token, expires_at__gt=timezone.now())
        user = auth_token.user
        profile_picture_url = None
        if user.profile_picture:
            try:
                profile_picture_url = user.profile_picture.url
            except:
                profile_picture_url = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcStltpfa69E9JTQOf5ZcyLGR8meBbxMFJxM0w&s'
        else:
            profile_picture_url = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcStltpfa69E9JTQOf5ZcyLGR8meBbxMFJxM0w&s'
        
        return JsonResponse({
            'success': True,
            'user': {
                'id': str(user.id),
                'username': user.username,
                'email': user.email,
                'profile_picture': profile_picture_url, 
                'models_count': user.models_count,
                'created_at': user.created_at.isoformat()
            }
        })
        
    except AuthToken.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Invalid or expired token'
        }, status=401)

@csrf_exempt
def logout_user(request):
    if request.method == 'DELETE':
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        if token:
            AuthToken.objects.filter(token=token).delete()
        
        return JsonResponse({
            'success': True,
            'message': 'Successfully logged out'
        })
    
    return JsonResponse({
        'success': False,
        'error': 'Only the DELETE method is allowed'
    }, status=405)

@token_required
def get_user_models_detailed(request):
    try:
        user = request.user
        
        user_models = UserModel.objects.filter(user=user).order_by('-created_at')
        models_data = []
        
        for model in user_models:
            stats = {
                'total_elements': model.total_elements or 0,
                'buildings': getattr(model, 'building_count', 0),
                'highways': getattr(model, 'highway_count', 0),
                'water': getattr(model, 'water_count', 0),
                'natural': getattr(model, 'natural_count', 0),
                'landuse': getattr(model, 'landuse_count', 0),
                'other': getattr(model, 'other_count', 0),
                'area_km2': getattr(model, 'area_km2', 0),
                'file_size_mb': model.file_size_mb or 0,
                'triangles_estimate': getattr(model, 'triangles_count', model.total_elements * 2 if model.total_elements else 0)
            }
            
            if stats['total_elements'] == 0 and stats['file_size_mb'] == 0:
                json_filename = os.path.join(settings.MEDIA_ROOT, 'models', f'{model.file_id}.json')
                if os.path.exists(json_filename):
                    try:
                        with open(json_filename, 'r', encoding='utf-8') as f:
                            model_data = json.load(f)
                        
                        element_types = {
                            'building': 0,
                            'highway': 0,
                            'water': 0,
                            'natural': 0,
                            'landuse': 0,
                            'other': 0
                        }
                        
                        for feature in model_data.get('geojson', {}).get('features', []):
                            props = feature.get('properties', {})
                            element_type = 'other'
                            if props.get('building'):
                                element_type = 'building'
                            elif props.get('highway'):
                                element_type = 'highway'
                            elif props.get('waterway') or props.get('natural') == 'water':
                                element_type = 'water'
                            elif props.get('natural'):
                                element_type = 'natural'
                            elif props.get('landuse'):
                                element_type = 'landuse'
                            
                            element_types[element_type] += 1
                            stats['total_elements'] += 1
                        
                        stats['buildings'] = element_types['building']
                        stats['highways'] = element_types['highway']
                        stats['water'] = element_types['water']
                        stats['natural'] = element_types['natural']
                        stats['landuse'] = element_types['landuse']
                        stats['other'] = element_types['other']
                        
                        bounds_list = model_data.get('bounds', [])
                        for bounds in bounds_list:
                            lat_diff = bounds.get('north', 0) - bounds.get('south', 0)
                            lng_diff = bounds.get('east', 0) - bounds.get('west', 0)
                            stats['area_km2'] += (lat_diff * lng_diff * 111.32 * 111.32)
                        
                        file_size = os.path.getsize(json_filename)
                        stats['file_size_mb'] = round(file_size / (1024 * 1024), 2)
                        
                        stats['triangles_estimate'] = stats['total_elements'] * 2
                        
                        model.total_elements = stats['total_elements']
                        model.file_size_mb = stats['file_size_mb']
                        model.building_count = stats['buildings']
                        model.highway_count = stats['highways']
                        model.water_count = stats['water']
                        model.natural_count = stats['natural']
                        model.landuse_count = stats['landuse']
                        model.other_count = stats['other']
                        model.area_km2 = stats['area_km2']
                        model.save()
                        
                    except Exception as e:
                        print(f"Error processing the model {model.file_id}: {str(e)}")
            
            models_data.append({
                'id': str(model.id),
                'title': model.title,
                'description': model.description,
                'file_id': model.file_id,
                'thumbnail': f'/media/{model.thumbnail}' if model.thumbnail else '/static/default-model-thumbnail.png',
                'created_at': model.created_at.isoformat(),
                'is_public': model.is_public,
                'views': getattr(model, 'public_view_count', 0) if model.is_public else 0,
                'stats': stats,
                'downloads': getattr(model, 'download_count', 0),
                'has_glb_export': model.has_glb_export,
                'glb_file_name': model.glb_file_name
            })
        
        return JsonResponse({
            'success': True,
            'models': models_data,
            'total': len(models_data)
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error loading models: {str(e)}'
        }, status=500)


@token_required
def get_account_stats(request):
    try:
        user = request.user
        user_models = list(UserModel.objects.filter(user=user))
        total_models = len(user_models)
        public_models_count = 0
        private_models_count = 0
        models_this_month_count = 0
        total_file_size_mb = 0
        total_elements = 0
        total_area_km2 = 0
        total_buildings = 0
        total_highways = 0
        total_water = 0
        total_natural = 0
        total_landuse = 0
        total_other = 0
        
        current_month = timezone.now().month
        current_year = timezone.now().year
        
        for model in user_models:
            if model.is_public:
                public_models_count += 1
            else:
                private_models_count += 1
            

            if (model.created_at and 
                model.created_at.month == current_month and 
                model.created_at.year == current_year):
                models_this_month_count += 1
            total_file_size_mb += getattr(model, 'file_size_mb', 0) or 0
            total_elements += getattr(model, 'total_elements', 0) or 0
            total_area_km2 += getattr(model, 'area_km2', 0) or 0
            total_buildings += getattr(model, 'building_count', 0) or 0
            total_highways += getattr(model, 'highway_count', 0) or 0
            total_water += getattr(model, 'water_count', 0) or 0
            total_natural += getattr(model, 'natural_count', 0) or 0
            total_landuse += getattr(model, 'landuse_count', 0) or 0
            total_other += getattr(model, 'other_count', 0) or 0
        
        total_file_size_mb = float(total_file_size_mb)
        total_elements = int(total_elements)
        total_area_km2 = float(total_area_km2)
        total_buildings = int(total_buildings)
        total_highways = int(total_highways)
        total_water = int(total_water)
        total_natural = int(total_natural)
        total_landuse = int(total_landuse)
        total_other = int(total_other)
        
        stats = {
            'total_models': total_models,
            'public_models': public_models_count,
            'private_models': private_models_count,
            'last_activity': user.updated_at.isoformat() if user.updated_at else user.created_at.isoformat(),
            'account_created': user.created_at.isoformat() if user.created_at else timezone.now().isoformat(),
            'storage_used_mb': round(total_file_size_mb, 2),
            'storage_used': f"{total_file_size_mb:.2f} MB",
            'models_this_month': models_this_month_count,
            'total_elements': total_elements,
            'total_area_km2': round(total_area_km2, 2),
            'total_buildings': total_buildings,
            'total_highways': total_highways,
            'total_water': total_water,
            'total_natural': total_natural,
            'total_landuse': total_landuse,
            'total_other': total_other,
            'buildings_percentage': round((total_buildings / total_elements * 100) if total_elements > 0 else 0, 1),
            'highways_percentage': round((total_highways / total_elements * 100) if total_elements > 0 else 0, 1),
            'water_percentage': round((total_water / total_elements * 100) if total_elements > 0 else 0, 1),

            'element_summary': {
                'buildings': total_buildings,
                'roads': total_highways,
                'water': total_water,
                'natural': total_natural,
                'landuse': total_landuse,
                'other': total_other
            }
        }
        
        
        return JsonResponse({
            'success': True,
            'stats': stats
        })
        
    except Exception as e:
        print(f" Error in get_account_stats: {str(e)}")
        import traceback
        traceback.print_exc()
        
        return JsonResponse({
            'success': False,
            'error': f'Error loading the statistics: {str(e)}'
        }, status=500)

@csrf_exempt
@token_required
def save_export(request):
    import os
    if request.method == 'POST':
        try:
            user = request.user
            glb_file = request.FILES.get('glb_file')
            file_id_input = request.POST.get('file_id') 
            element_count = request.POST.get('element_count', 0)
            thumbnail_data = request.POST.get('thumbnail_data')
            camera_position_json = request.POST.get('camera_position')
            
            if not glb_file:
                return JsonResponse({'success': False, 'error': 'The GLB file is required'}, status=400)
            
            if not glb_file.name.lower().endswith('.glb'):
                return JsonResponse({'success': False, 'error': 'Only GLB files are accepted'}, status=400)
            
            file_id = file_id_input
            action = 'create'
            
            if file_id_input and UserModel.objects.filter(user=user, file_id=file_id_input).count() > 0:
                file_id = file_id_input
                action = 'update'
            else:
                if file_id_input and UserModel.objects.filter(file_id=file_id_input).count() > 0:
                    file_id = f"project_{uuid.uuid4().hex[:12]}"
                elif not file_id_input or file_id_input.startswith('temp_'):
                    file_id = f"project_{uuid.uuid4().hex[:12]}"
                
                action = 'create'

            exports_dir = os.path.join(settings.MEDIA_ROOT, 'exports', 'user_exports')
            os.makedirs(exports_dir, exist_ok=True)
            
            file_path = os.path.join(exports_dir, f'{file_id}.glb')
            
            if os.path.exists(file_path):
                os.remove(file_path)
            
            with open(file_path, 'wb+') as destination:
                for chunk in glb_file.chunks():
                    destination.write(chunk)
            
            thumbnail_filename = None
            if thumbnail_data:
                try:
                    format, imgstr = thumbnail_data.split(';base64,')
                    ext = format.split('/')[-1] 
                    thumbnail_filename = f'thumbnail_{file_id}.jpg'
                    image_data = base64.b64decode(imgstr)
                    thumbnail_file = ContentFile(image_data, name=thumbnail_filename)
                except Exception as e:
                    print(f"Error processing the thumbnail: {str(e)}")
                    thumbnail_file = None
                    thumbnail_filename = None

            camera_position = None
            if camera_position_json:
                try:
                    camera_position = json.loads(camera_position_json)
                except:
                    camera_position = None
                    
            clean_name = request.POST.get('project_name', f"Model {file_id}")
            building_count = request.POST.get('building_count', 0)
            highway_count = request.POST.get('highway_count', 0)
            water_count = request.POST.get('water_count', 0)
            natural_count = request.POST.get('natural_count', 0)
            landuse_count = request.POST.get('landuse_count', 0)
            other_count = request.POST.get('other_count', 0)
            
            existing = UserModel.objects.filter(user=user, file_id=file_id).first()
            
            if existing:
                user_model = existing
                created = False
                user_model.title = clean_name
                user_model.description = f"3D Model"
                user_model.is_public = False
                user_model.glb_file_name = f"{file_id}.glb"
                user_model.total_elements = int(element_count)
                user_model.file_size_mb = float(request.POST.get('file_size_mb', 0))
                user_model.building_count = int(building_count)
                user_model.highway_count = int(highway_count)
                user_model.water_count = int(water_count)
                user_model.natural_count = int(natural_count)
                user_model.landuse_count = int(landuse_count)
                user_model.other_count = int(other_count)
                user_model.has_glb_export = True
                user_model.glb_export_time = timezone.now()
                user_model.updated_at = timezone.now()
                user_model.camera_position = camera_position
                if thumbnail_file:
                    user_model.thumbnail_updated = timezone.now()
                user_model.save()
            else:
                user_model = UserModel(
                    user=user,
                    file_id=file_id,
                    title=clean_name,
                    description=f"3D Model",
                    is_public=False,
                    glb_file_name=f"{file_id}.glb",
                    total_elements=int(element_count),
                    file_size_mb=float(request.POST.get('file_size_mb', 0)),
                    building_count=int(building_count),
                    highway_count=int(highway_count),
                    water_count=int(water_count),
                    natural_count=int(natural_count),
                    landuse_count=int(landuse_count),
                    other_count=int(other_count),
                    has_glb_export=True,
                    glb_export_time=timezone.now(),
                    updated_at=timezone.now(),
                    camera_position=camera_position,
                    thumbnail_updated=timezone.now() if thumbnail_file else None,
                )
                user_model.save()
                created = True
            
            if thumbnail_file and thumbnail_filename:
                from django.core.files.storage import default_storage
                import os
                
                thumbnail_dir = os.path.join(settings.MEDIA_ROOT, 'thumbnails')
                os.makedirs(thumbnail_dir, exist_ok=True)
                
                thumbnail_path = os.path.join('thumbnails', thumbnail_filename)
                saved_path = default_storage.save(thumbnail_path, thumbnail_file)
                
                user_model.thumbnail = saved_path
                user_model.thumbnail_updated = timezone.now()
                user_model.save()
            
            user.models_count = UserModel.objects.filter(user=user).count()
            user.last_model_created = timezone.now()
            user.save()
            
            thumbnail_url = None
            if user_model.thumbnail:
                thumbnail_url = f'{settings.MEDIA_URL}{user_model.thumbnail}'
            
            response_data = {
                'success': True,
                'message': f'Project {action} successfully!',
                'file_id': file_id,
                'action': action,
                'user_models_count': user.models_count,
                'thumbnail_saved': bool(thumbnail_file),
                'thumbnail_url': thumbnail_url,
                'project_info': {
                    'element_count': int(element_count),
                    'building_count': int(building_count),
                    'file_size_mb': float(request.POST.get('file_size_mb', 0)),
                }
            }

            return JsonResponse(response_data)
            
        except Exception as e:
            print(f" Error save_export: {str(e)}")
            import traceback
            traceback.print_exc()
            return JsonResponse({'success': False, 'error': str(e)}, status=500)
    
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

@never_cache
def get_glb_file(request, file_id):
    try:
        glb_filename = os.path.join(settings.MEDIA_ROOT, 'exports', 'user_exports', f'{file_id}.glb')
        
        if not os.path.exists(glb_filename):
            glb_filename = os.path.join(settings.MEDIA_ROOT, 'exports', 'user_exports', f'export_{file_id}.glb')
        
        
        if os.path.exists(glb_filename):
            user_model = UserModel.objects.filter(file_id=file_id, is_public=True).first()
            
            if not user_model:
                token = request.headers.get('Authorization', '').replace('Bearer ', '')
                if token:
                    try:
                        auth_token = AuthToken.objects.get(token=token, expires_at__gt=timezone.now())
                        user = auth_token.user
                        user_model = UserModel.objects.filter(user=user, file_id=file_id).first()
                    except AuthToken.DoesNotExist:
                        user_model = None
                
                if not user_model:
                    return JsonResponse({
                        'success': False,
                        'error': 'The model is not public or you do not have access'
                    }, status=403)
            
            response = FileResponse(open(glb_filename, 'rb'), content_type='model/gltf-binary')
            response['Cache-Control'] = 'public, max-age=3600'
            response['Content-Disposition'] = f'inline; filename="{file_id}.glb"'
            response['Access-Control-Allow-Origin'] = '*'  
            return response

        
        user_model = UserModel.objects.filter(file_id=file_id, is_public=True).first()
        
        if not user_model:
            token = request.headers.get('Authorization', '').replace('Bearer ', '')
            if token:
                try:
                    auth_token = AuthToken.objects.get(token=token, expires_at__gt=timezone.now())
                    user = auth_token.user
                    user_model = UserModel.objects.filter(user=user, file_id=file_id).first()
                except AuthToken.DoesNotExist:
                    pass
            
            if not user_model:
                return JsonResponse({
                    'success': False,
                    'error': 'The model is not public or you do not have access'
                }, status=403)

        if not user_model:
            return JsonResponse({
                'success': False,
                'error': 'The file was not found în baza de date'
            }, status=404)

        if not user_model.glb_file:
            return JsonResponse({
                'success': False, 
                'error': 'There is no GLB file for this model'
            }, status=404)

        

        file_handle = user_model.glb_file.open()
        response = FileResponse(file_handle, content_type='model/gltf-binary')
        response['Cache-Control'] = 'public, max-age=3600' 
        response['Content-Disposition'] = f'inline; filename="{user_model.glb_file_name}"'
        response['Access-Control-Allow-Origin'] = '*' 
        
        return response

    except Exception as e:
        print(f" Error serving the GLB: {str(e)}")
        import traceback
        traceback.print_exc()
        
        return JsonResponse({
            'success': False,
            'error': f'Server error: {str(e)}'
        }, status=500)


def download_export(request, file_id):
    try:
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        user = None
        
        if token:
            try:
                auth_token = AuthToken.objects.get(token=token, expires_at__gt=timezone.now())
                user = auth_token.user
            except AuthToken.DoesNotExist:
                pass
        
        file_path = os.path.join(settings.MEDIA_ROOT, 'exports', 'user_exports', f'{file_id}.glb')
        
        if not os.path.exists(file_path):
            return JsonResponse({
                'success': False,
                'error': 'The exported file was not found'
            }, status=404)
        
        if user:
            try:
                user_model = UserModel.objects.get(file_id=file_id, user=user)
            except UserModel.DoesNotExist:
                return JsonResponse({
                    'success': False,
                    'error': 'You do not have permission to download this file'
                }, status=403)
        
        response = HttpResponse(content_type='model/gltf-binary')
        
        response['Content-Disposition'] = f'attachment; filename="{file_id}.glb"'
        
        with open(file_path, 'rb') as f:
            while True:
                chunk = f.read(8192)
                if not chunk:
                    break
                response.write(chunk)
        
        return response
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

def get_glb_file(request, file_id):
    try:
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        user = None
        
        if token:
            try:
                auth_token = AuthToken.objects.get(token=token, expires_at__gt=timezone.now())
                user = auth_token.user
            except AuthToken.DoesNotExist:
                pass
        
        glb_path = os.path.join(settings.MEDIA_ROOT, 'exports', 'user_exports', f'{file_id}.glb')
        
        if not os.path.exists(glb_path):
            return JsonResponse({
                'success': False,
                'error': 'The GLB file was not found'
            }, status=404)
        
        if user:
            try:
                user_model = UserModel.objects.get(file_id=file_id, user=user)
            except UserModel.DoesNotExist:
                return JsonResponse({
                    'success': False,
                    'error': 'You do not have permission to download this file'
                }, status=403)
        
        response = HttpResponse(content_type='model/gltf-binary')
        response['Content-Disposition'] = f'attachment; filename="{file_id}.glb"'
        
        with open(glb_path, 'rb') as f:
            while True:
                chunk = f.read(8192)
                if not chunk:
                    break
                response.write(chunk)
        
        return response
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

def save_glb_file(file_id, glb_data, user=None):
    try:
        exports_dir = os.path.join(settings.MEDIA_ROOT, 'exports', 'user_exports')
        os.makedirs(exports_dir, exist_ok=True)
        
        if not file_id.startswith('export_'):
            file_id = f"export_{file_id}"
        
        glb_filename = os.path.join(exports_dir, f'{file_id}.glb')
        
        if os.path.exists(glb_filename):
            os.remove(glb_filename)
        
        with open(glb_filename, 'wb') as f:
            f.write(glb_data)
        
        
        if user:
            with transaction.atomic():
                user_model, created = UserModel.objects.update_or_create(
                    user=user,
                    file_id=file_id,
                    defaults={
                        'title': f"Model {file_id}",
                        'description': f"Model 3D",
                        'is_public': False,
                        'file_size_mb': round(len(glb_data) / (1024 * 1024), 2),
                        'has_glb_export': True,
                        'glb_file_name': f"{file_id}.glb",
                        'glb_export_time': timezone.now(),
                        'updated_at': timezone.now()
                    }
                )
                user.models_count = UserModel.objects.filter(user=user).count()
                user.last_model_created = timezone.now()
                user.save()
        
        return True, glb_filename
    except Exception as e:
        print(f" Error saving the GLB: {str(e)}")
        import traceback
        traceback.print_exc()
        return False, str(e)

@token_required
def cleanup_duplicate_files(request):
    try:
        user = request.user
        user_models = UserModel.objects.filter(user=user)
        
        cleaned_count = 0
        for model in user_models:
            file_path = os.path.join(settings.MEDIA_ROOT, 'exports', 'user_exports', f'{model.file_id}.glb')
            
            if os.path.exists(file_path):
                duplicates = UserModel.objects.filter(user=user, file_id=model.file_id)
                if duplicates.count() > 1:
                    models_to_delete = duplicates.exclude(id=model.id)
                    deleted_count = models_to_delete.delete()[0]
                    cleaned_count += deleted_count

        
        return JsonResponse({
            'success': True,
            'message': f'Full cleanup. Deleted {cleaned_count} duplicate records',
            'cleaned_count': cleaned_count
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error during cleanup: {str(e)}'
        }, status=500)

@xframe_options_exempt
@csrf_exempt
def download_model_archive(request, file_id):
    try:
        user_model = None

        try:

            possible_models = UserModel.objects.filter(file_id=file_id)
            
            for model in possible_models:
                if getattr(model, 'is_public', False):
                    user_model = model
                    break
        except Exception as db_error:
            print(f"Error searching the database: {str(db_error)}")
        
        if not user_model:
            token = request.headers.get('Authorization', '').replace('Bearer ', '')
            if token:
                try:
                    auth_token = AuthToken.objects.get(token=token, expires_at__gt=timezone.now())
                    user = auth_token.user
                    possible_user_models = UserModel.objects.filter(user=user, file_id=file_id)
                    if possible_user_models.count() > 0:
                        user_model = possible_user_models.first()
                except (AuthToken.DoesNotExist, UserModel.DoesNotExist):
                    user_model = None
            
            if not user_model:
                return JsonResponse({
                    'success': False,
                    'error': 'The model is not public or you do not have access to it'
                }, status=403)
        json_exists = False
        glb_exists = False
        
        json_filename = os.path.join(settings.MEDIA_ROOT, 'models', f'{file_id}.json')
        glb_filename = os.path.join(settings.MEDIA_ROOT, 'exports', 'user_exports', f'{file_id}.glb')
        glb_filename_with_export = os.path.join(settings.MEDIA_ROOT, 'exports', 'user_exports', f'export_{file_id}.glb')
        
        if os.path.exists(json_filename):
            json_exists = True
        
        if os.path.exists(glb_filename):
            glb_exists = True
        elif os.path.exists(glb_filename_with_export):
            glb_exists = True
            glb_filename = glb_filename_with_export
        
        if not json_exists and not glb_exists:
            return JsonResponse({
                'success': False,
                'error': 'There are no files available for this model'
            }, status=404)

        response = HttpResponse(content_type='application/zip')
        response['Content-Disposition'] = f'attachment; filename="{file_id}_model.zip"'
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Expose-Headers'] = 'Content-Disposition'


        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:

            if json_exists:
                try:
                    zip_file.write(json_filename, f'{file_id}.json')
                except Exception as e:
                    print(f"Error adding JSON: {str(e)}")
            
            if glb_exists:
                try:
                    zip_file.write(glb_filename, f'{file_id}.glb')
                except Exception as e:
                    print(f"Error adding GLB: {str(e)}")

            try:
                author_name = user_model.user.username if user_model and user_model.user else 'Anonymous'
                model_title = user_model.title if user_model else file_id
                model_desc = user_model.description if user_model else 'Unspecified'
                created_date = user_model.created_at.strftime('%Y-%m-%d %H:%M:%S') if user_model and user_model.created_at else 'Necunoscută'
                elements_count = user_model.total_elements if user_model else 0
                file_size = user_model.file_size_mb if user_model else 0
                views_count = getattr(user_model, 'public_view_count', 0) if user_model else 0
            except Exception as e:
                print(f" Error retrieving the model information: {str(e)}")
                author_name = 'Anonymous'
                model_title = file_id
                model_desc = 'Unspecified'
                created_date = 'Necunoscută'
                elements_count = 0
                file_size = 0
                views_count = 0

            readme_content = f"""ELMC 3D Model Archive
========================

Model: {model_title}
Description: {model_desc}
Author: {author_name}
Creation date: {created_date}
Number of elements: {elements_count}
Size: {file_size} MB
Views: {views_count}

Files included in this archive:
- {file_id}.json: Geometric data and element properties
- {file_id}.glb: The 3D model in binary format 

To view the model, visit: https://elmc-3d.ro/view-3d/{file_id}/
"""
            zip_file.writestr('README.txt', readme_content)

        zip_buffer.seek(0)
        
        response.write(zip_buffer.getvalue())
        zip_buffer.close()

        if user_model:
            try:
                current_downloads = getattr(user_model, 'download_count', 0)
                user_model.download_count = current_downloads + 1
                user_model.save()
            except Exception as e:
                print(f"AnonymousError updating the download counter: {str(e)}")

        return response

    except Exception as e:
        print(f"Error creating the archive for {file_id}: {str(e)}")
        import traceback
        traceback.print_exc()
        
        return JsonResponse({
            'success': False,
            'error': f'Error creating the archive: {str(e)}'
        }, status=500)



@csrf_exempt
@token_required
def update_project_thumbnail(request, file_id):
    if request.method == 'PUT':
        try:
            user = request.user
            data = json.loads(request.body)
            
            thumbnail_data = data.get('thumbnail_data')
            camera_position = data.get('camera_position', {})
            
            if not thumbnail_data:
                return JsonResponse({
                    'success': False,
                    'error': 'Thumbnail data missing'
                }, status=400)
            
            user_model = UserModel.objects.filter(user=user, file_id=file_id).first()
            if not user_model:
                return JsonResponse({
                    'success': False,
                    'error': 'The project was not found'
                }, status=404)
            
            format, imgstr = thumbnail_data.split(';base64,')
            ext = format.split('/')[-1]
            

            thumbnail_file = ContentFile(
                base64.b64decode(imgstr),
                name=f'thumbnail_{file_id}.{ext}'
            )
            
            user_model.thumbnail = thumbnail_file
            user_model.camera_position = camera_position
            user_model.thumbnail_updated = timezone.now()
            user_model.save()
            
            return JsonResponse({
                'success': True,
                'message': 'Thumbnail updated successfully',
                'thumbnail_url': user_model.thumbnail.url if user_model.thumbnail else None
            })
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'error': f'Error updating the thumbnail: {str(e)}'
            }, status=500)
    
    return JsonResponse({
        'success': False,
        'error': 'Only the PUT method is allowed'
    }, status=405)

def get_project_thumbnail(request, file_id):
    try:
        user_model = None
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        
        if token:
            try:
                auth_token = AuthToken.objects.get(token=token, expires_at__gt=timezone.now())
                user = auth_token.user
                user_model = UserModel.objects.filter(user=user, file_id=file_id).first()
            except AuthToken.DoesNotExist:
                pass
    
        if not user_model:
            user_model = UserModel.objects.filter(file_id=file_id, is_public=True).first()

        if user_model and user_model.thumbnail:
            try:
                if default_storage.exists(user_model.thumbnail):
                    file = default_storage.open(user_model.thumbnail, 'rb')
                    response = FileResponse(file, content_type='image/jpeg')
                    response['Cache-Control'] = 'public, max-age=86400' 
                    response["Access-Control-Allow-Origin"] = "*"
                    return response
            except Exception as e:
                print(f"Error opening the thumbnail: {str(e)}")
        
        img = Image.new('RGB', (400, 300), color='#1e293b')
        draw = ImageDraw.Draw(img)
        
        for i in range(0, 400, 20):
            draw.line([(i, 0), (i, 300)], fill='#334155', width=1)
        for i in range(0, 300, 20):
            draw.line([(0, i), (400, i)], fill='#334155', width=1)
        
        draw.text((120, 130), 'No Preview', fill='#94a3b8', font=None)
        draw.text((100, 150), 'Upload a model', fill='#64748b', font=None)
        
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)
        
        response = HttpResponse(buffer.getvalue(), content_type='image/png')
        response["Access-Control-Allow-Origin"] = "*"
        return response
        
    except Exception as e:
        print(f"Error serving the thumbnail: {str(e)}")
        
        return JsonResponse({
            'success': False,
            'error': 'Thumbnail is not available',
            'file_id': file_id
        }, status=404)

@csrf_exempt
@token_required
def update_model(request, file_id):
    if request.method == 'PUT':
        try:
            user = request.user
            
            data = json.loads(request.body)

            
            user_model = UserModel.objects.filter(user=user, file_id=file_id).first()
            if not user_model:
                return JsonResponse({
                    'success': False,
                    'error': 'The model was not found or does not belong to your account'
                }, status=404)
            
            updates = []
            if 'title' in data:
                new_title = data['title'].strip()
                if new_title and new_title != user_model.title:
                    user_model.title = new_title
                    updates.append('title')
            
            if 'description' in data:
                new_description = data['description'].strip()
                if new_description != user_model.description:
                    user_model.description = new_description
                    updates.append('description')

            if updates:
                user_model.updated_at = timezone.now()
                user_model.save()
                
                response_data = {
                    'success': True,
                    'message': f'Model updated successfully ({", ".join(updates)})',
                    'model': {
                        'file_id': user_model.file_id,
                        'title': user_model.title,
                        'is_public': user_model.is_public,
                        'public_view_count': getattr(user_model, 'public_view_count', 0),
                        'description': user_model.description
                    }
                }
            else:
                response_data = {
                    'success': True,
                    'message': 'No field was modified',
                    'model': {
                        'file_id': user_model.file_id,
                        'title': user_model.title,
                        'is_public': user_model.is_public,
                        'public_view_count': getattr(user_model, 'public_view_count', 0),
                        'description': user_model.description
                    }
                }
            
            return JsonResponse(response_data)
            
        except json.JSONDecodeError as e:
            print(f"Error decoding JSON: {str(e)}")
            return JsonResponse({
                'success': False,
                'error': 'Invalide Date'
            }, status=400)
        except Exception as e:
            print(f" Error updating the model: {str(e)}")
            import traceback
            traceback.print_exc()
            return JsonResponse({
                'success': False,
                'error': f'Error updating the model: {str(e)}'
            }, status=500)
    
    return JsonResponse({
        'success': False,
        'error': 'Only the POST method is allowed'
    }, status=405)


def get_public_models(request):
    try: 
        page = int(request.GET.get('page', 1))
        per_page = int(request.GET.get('per_page', 12))
        search = request.GET.get('search', '').strip()
        sort_by = request.GET.get('sort', 'newest')
        element_type = request.GET.get('element_type', 'all')
        date_range = request.GET.get('date_range', 'all')
        
        try:
            all_models = list(UserModel.objects.all())

            public_count_manual = 0
            for model in all_models:
                if getattr(model, 'is_public', False):
                    public_count_manual += 1
        except Exception as e:
            print(f"Error during initial validation: {str(e)}")

        all_models = UserModel.objects.all()
        public_models_list = []
        
        for model in all_models:
            if getattr(model, 'is_public', False):
                public_models_list.append(model)
        
        filtered_models = public_models_list
        
        if search:
            search = search.lower()
            filtered_models = [
                model for model in filtered_models 
                if (search in (model.title or '').lower() or 
                    search in (model.description or '').lower() or
                    search in (model.user.username or '').lower())
            ]
        
        if element_type != 'all':
            filtered_models = [
                model for model in filtered_models
                if (element_type == 'buildings' and getattr(model, 'building_count', 0) > 0) or
                   (element_type == 'highways' and getattr(model, 'highway_count', 0) > 0) or
                   (element_type == 'water' and getattr(model, 'water_count', 0) > 0) or
                   (element_type == 'natural' and getattr(model, 'natural_count', 0) > 0)
            ]
          
        
        if date_range != 'all':
            now = timezone.now()
            filtered_models = [
                model for model in filtered_models
                if model.created_at and (
                    (date_range == 'today' and model.created_at.date() == now.date()) or
                    (date_range == 'week' and model.created_at >= now - timedelta(days=7)) or
                    (date_range == 'month' and model.created_at >= now - timedelta(days=30)) or
                    (date_range == 'year' and model.created_at >= now - timedelta(days=365))
                )
            ]
        
      
        current_user = None
        try:
            auth_header = request.headers.get('Authorization', '')
            if auth_header.startswith('Bearer '):
                token_str = auth_header.split(' ')[1]
                try:
                    auth_token = AuthToken.objects.get(
                        token=token_str,
                        expires_at__gt=timezone.now()
                    )
                    current_user = auth_token.user
                except AuthToken.DoesNotExist:
                    print(f" Invalid or expired token")
        except Exception as auth_error:
            print(f"Error verifying authentication: {str(auth_error)}")
        
        if sort_by == 'newest':
            filtered_models.sort(key=lambda x: x.created_at if x.created_at else timezone.now(), reverse=True)
        elif sort_by == 'oldest':
            filtered_models.sort(key=lambda x: x.created_at if x.created_at else timezone.now())
        elif sort_by == 'views':
            filtered_models.sort(key=lambda x: getattr(x, 'public_view_count', 0), reverse=True)
        elif sort_by == 'elements':
            filtered_models.sort(key=lambda x: getattr(x, 'total_elements', 0), reverse=True)
        elif sort_by == 'downloads':
            filtered_models.sort(key=lambda x: getattr(x, 'download_count', 0), reverse=True)
        elif sort_by == 'favorites':
            filtered_models.sort(key=lambda x: len(x.favorites or []) if hasattr(x, 'favorites') else 0, reverse=True)
        
        
        total_count = len(filtered_models)
        total_pages = (total_count + per_page - 1) // per_page if total_count > 0 else 1
        
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        
        models_page = filtered_models[start_idx:end_idx]
        

        models_data = []
        for model in models_page:
            try:

                owner_profile_picture = None
                if hasattr(model.user, 'profile_picture') and model.user.profile_picture:
                    try:
                        owner_profile_picture = model.user.profile_picture.url
                    except:
                        owner_profile_picture = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcStltpfa69E9JTQOf5ZcyLGR8meBbxMFJxM0w&s'
                else:
                    owner_profile_picture = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcStltpfa69E9JTQOf5ZcyLGR8meBbxMFJxM0w&s'
                
                thumbnail_url = None
                if model.thumbnail:
                    try:
                        thumbnail_url = model.thumbnail.url
                    except:
                        thumbnail_url = f'/api/project/{model.file_id}/thumbnail/image/'
                else:
                    thumbnail_url = f'/api/project/{model.file_id}/thumbnail/image/'
                
                is_owner = current_user and model.user.id == current_user.id
                
              
                is_favorited = False
                try:
                    if current_user and not is_owner:  
                      
                        if hasattr(model, 'favorites'):
                            is_favorited = model.favorites.filter(id=current_user.id).count() > 0
                except Exception as fav_error:
                    print(f"Error checking favorites: {str(fav_error)}")
                
                favorites_count = 0
                try:
                    if hasattr(model, 'favorites'):
                        favorites_count = len(model.favorites or [])
                except Exception as count_error:
                    print(f"Error counting favorites: {str(count_error)}")
                
                stats = {
                    'total_elements': getattr(model, 'total_elements', 0),
                    'building_count': getattr(model, 'building_count', 0),
                    'highway_count': getattr(model, 'highway_count', 0),
                    'water_count': getattr(model, 'water_count', 0),
                    'natural_count': getattr(model, 'natural_count', 0),
                    'landuse_count': getattr(model, 'landuse_count', 0),
                    'other_count': getattr(model, 'other_count', 0),
                    'file_size_mb': getattr(model, 'file_size_mb', 0),
                    'area_km2': getattr(model, 'area_km2', 0)
                }
                
                model_data = {
                    'id': str(model.id),
                    'file_id': model.file_id,
                    'title': model.title or f"Model {model.file_id}",
                    'description': model.description or 'No description added',
                    'thumbnail': thumbnail_url,
                    'created_at': model.created_at.isoformat() if model.created_at else timezone.now().isoformat(),
                    'updated_at': model.updated_at.isoformat() if model.updated_at else timezone.now().isoformat(),
                    'is_public': getattr(model, 'is_public', False),
                    'views': getattr(model, 'public_view_count', 0),
                    'downloads': getattr(model, 'download_count', 0),
                    'is_favorited': is_favorited,
                    'favorites_count': favorites_count,
                    'is_owner': is_owner,  
                    'stats': stats,
                    'owner': {
                        'id': str(model.user.id),
                        'username': model.user.username,
                        'profile_picture': owner_profile_picture
                    }
                }
                models_data.append(model_data)
            except Exception as model_error:
                print(f" Error processing the model {model.file_id}: {str(model_error)}")
                import traceback
                traceback.print_exc()
                continue
        
        
        return JsonResponse({
            'success': True,
            'models': models_data,
            'pagination': {
                'current_page': page,
                'per_page': per_page,
                'total_count': total_count,
                'total_pages': total_pages,
                'has_previous': page > 1,
                'has_next': page < total_pages
            }
        })
        
    except Exception as e:
        print(f"Critical ERROR in get_public_models: {str(e)}")
        import traceback
        traceback.print_exc()

        return JsonResponse({
            'success': True, 
            'models': [],
            'pagination': {
                'current_page': 1,
                'per_page': 12,
                'total_count': 0,
                'total_pages': 1,
                'has_previous': False,
                'has_next': False
            }
        })
        
@csrf_exempt
@token_required
@csrf_exempt
@token_required
def toggle_favorite(request, file_id):
    try:
        user = request.user
        user_id = str(user.id)  
        
        user_model = UserModel.objects.filter(file_id=file_id).first()
        if not user_model:
            return JsonResponse({
                'success': False,
                'error': 'The model was not found'
            }, status=404)
        
        if str(user_model.user.id) == user_id:
            return JsonResponse({
                'success': False,
                'error': 'You cannot add your own models to favorites'
            }, status=400)
        
        favorites_list = user_model.favorites or []
        
        if user_id in favorites_list:
            favorites_list.remove(user_id)
            favorited = False
        else:
            favorites_list.append(user_id)
            favorited = True
        
        user_model.favorites = favorites_list
        user_model.save()
        
        return JsonResponse({
            'success': True,
            'message': f'Model {"added to" if favorited else "removed from"} favorites',
            'favorited': favorited,
            'favorites_count': len(favorites_list),
            'file_id': file_id
        })
        
    except Exception as e:
        print(f"Error toggling favorite: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': f'Error handling favorites: {str(e)}'
        }, status=500)

@token_required
def get_user_favorites(request):
    try:
        user = request.user
        user_id = str(user.id)
        
        all_models = UserModel.objects.all()
        favorite_models = []
        
        for model in all_models:
            favorites = model.favorites or []
            if user_id in favorites:
                favorite_models.append(model)
        
        models_data = []
        for model in favorite_models:
            thumbnail_url = None
            if model.thumbnail:
                try:
                    thumbnail_url = model.thumbnail.url
                except:
                    thumbnail_url = f'/api/project/{model.file_id}/thumbnail/image/'
            else:
                thumbnail_url = f'/api/project/{model.file_id}/thumbnail/image/'
            
            favorites_count = len(model.favorites or [])
            
            models_data.append({
                'id': str(model.id),
                'file_id': model.file_id,
                'title': model.title,
                'description': model.description,
                'thumbnail': thumbnail_url,
                'created_at': model.created_at.isoformat() if model.created_at else None,
                'updated_at': model.updated_at.isoformat() if model.updated_at else None,
                'is_public': model.is_public,
                'views': getattr(model, 'public_view_count', 0),
                'downloads': getattr(model, 'download_count', 0),
                'favorites_count': favorites_count,
                'is_favorited': True,
                'stats': {
                    'total_elements': getattr(model, 'total_elements', 0),
                    'building_count': getattr(model, 'building_count', 0),
                    'highway_count': getattr(model, 'highway_count', 0),
                    'water_count': getattr(model, 'water_count', 0),
                    'natural_count': getattr(model, 'natural_count', 0),
                    'landuse_count': getattr(model, 'landuse_count', 0),
                    'file_size_mb': getattr(model, 'file_size_mb', 0),
                    'area_km2': getattr(model, 'area_km2', 0)
                },
                'owner': {
                    'id': str(model.user.id),
                    'username': model.user.username,
                    'profile_picture': get_user_profile_picture_url(model.user)
                }
            })
        
        return JsonResponse({
            'success': True,
            'favorites': models_data,
            'total': len(models_data)
        })
        
    except Exception as e:
        print(f"Error in get_user_favorites: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': f'Error retrieving favorites: {str(e)}'
        }, status=500)
        
@csrf_exempt
def increment_model_view(request, file_id):
    if request.method == 'POST':
        try:
            all_models = UserModel.objects.filter(file_id=file_id)
            user_model = None
            
            for model in all_models:
                if getattr(model, 'is_public', False):
                    user_model = model
                    break
            
            if not user_model:
                return JsonResponse({
                    'success': False,
                    'error': 'The model was not found sau nu este public'
                }, status=404)
            
            auth_header = request.headers.get('Authorization', '')
            if auth_header.startswith('Bearer '):
                token_str = auth_header.split(' ')[1]
                try:
                    from django.utils import timezone
                    from .models import AuthToken
                    
                    auth_token = AuthToken.objects.filter(
                        token=token_str,
                        expires_at__gt=timezone.now()
                    ).first()
                    
                    if auth_token and auth_token.user == user_model.user:
                        return JsonResponse({
                            'success': True,
                            'message': 'Views are not incremented for your own model',
                            'file_id': file_id,
                            'views': user_model.public_view_count,
                            'is_owner': True
                        })
                except Exception as token_error:
                    print(f"Error verifying the token: {token_error}")
            
            current_views = getattr(user_model, 'public_view_count', 0)
            user_model.public_view_count = current_views + 1
            user_model.save()
        
            
            return JsonResponse({
                'success': True,
                'message': 'The view has been recorded',
                'file_id': file_id,
                'views': user_model.public_view_count,
                'is_owner': False
            })
            
        except Exception as e:
            print(f"Error incrementing views: {str(e)}")
            import traceback
            traceback.print_exc()
            
            return JsonResponse({
                'success': False,
                'error': f'Error registering the view: {str(e)}'
            }, status=500)
    
    return JsonResponse({
        'success': False,
        'error': 'Only the POST method is allowed'
    }, status=405)
   




@csrf_exempt
@token_required
def delete_model(request, file_id):
    if request.method == 'DELETE':
        try:
            user = request.user
            
            user_model = UserModel.objects.filter(user=user, file_id=file_id).first()
            if not user_model:
                return JsonResponse({
                    'success': False,
                    'error': 'The model was not found or does not belong to your account'
                }, status=404)
            
            user_model.favorites.clear()
            
            json_filename = os.path.join(settings.MEDIA_ROOT, 'models', f'{file_id}.json')
            if os.path.exists(json_filename):
                os.remove(json_filename)
             
            
            glb_filename = os.path.join(settings.MEDIA_ROOT, 'exports', 'user_exports', f'{file_id}.glb')
            if os.path.exists(glb_filename):
                os.remove(glb_filename)
            
            
            glb_export_filename = os.path.join(settings.MEDIA_ROOT, 'exports', 'user_exports', f'export_{file_id}.glb')
            if os.path.exists(glb_export_filename):
                os.remove(glb_export_filename)
              
            
            if user_model.thumbnail:
                thumbnail_path = user_model.thumbnail.path
                if os.path.exists(thumbnail_path):
                    os.remove(thumbnail_path)

            
            user_model.delete()
            
            user.models_count = UserModel.objects.filter(user=user).count()
            user.save()
            
            return JsonResponse({
                'success': True,
                'message': 'Model deleted successfully',
                'remaining_models': user.models_count
            })
            
        except Exception as e:
            print(f" Error deleting the model: {str(e)}")
            return JsonResponse({
                'success': False,
                'error': f'Error deleting the model: {str(e)}'
            }, status=500)
    
    return JsonResponse({
        'success': False,
        'error': 'Only the DELETE method is allowed'
    }, status=405)

@token_required
def get_model_stats(request, file_id):
    try:
        user = request.user
        
        user_model = UserModel.objects.filter(user=user, file_id=file_id).first()
        if not user_model:
            user_model = UserModel.objects.filter(file_id=file_id, is_public=True).first()
            if not user_model:
                return JsonResponse({
                    'success': False,
                    'error': 'The model was not found'
                }, status=404)
        
        if user_model.is_public and (not user_model.user or str(user_model.user.id) != str(user.id)):
            user_model.public_view_count = getattr(user_model, 'public_view_count', 0) + 1
            user_model.save()
        
        stats = {
            'file_id': user_model.file_id,
            'title': user_model.title,
            'description': user_model.description,
            'is_public': user_model.is_public,
            'created_at': user_model.created_at.isoformat() if user_model.created_at else None,
            'updated_at': user_model.updated_at.isoformat() if user_model.updated_at else None,
            
            'total_elements': user_model.total_elements or 0,
            'file_size_mb': user_model.file_size_mb or 0,
            'area_km2': user_model.area_km2 or 0,
            'has_glb_export': user_model.has_glb_export,

            'building_count': user_model.building_count or 0,
            'highway_count': user_model.highway_count or 0,
            'water_count': user_model.water_count or 0,
            'natural_count': user_model.natural_count or 0,
            'landuse_count': user_model.landuse_count or 0,
            'other_count': user_model.other_count or 0,
            
            'download_count': getattr(user_model, 'download_count', 0),
            'public_view_count': getattr(user_model, 'public_view_count', 0) if user_model.is_public else 0,
            'glb_export_time': user_model.glb_export_time.isoformat() if user_model.glb_export_time else None,
            
            'owner': {
                'username': user_model.user.username if user_model.user else 'Anonymous',
                'is_owner': str(user_model.user.id) == str(user.id) if user_model.user else False
            }
        }
        
        return JsonResponse({
            'success': True,
            'stats': stats
        })
        
    except Exception as e:
        print(f"Error retrieving the model statistics: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': f'Error retrieving statistics: {str(e)}'
        }, status=500)

@csrf_exempt
@token_required
def toggle_model_visibility(request, file_id):
    if request.method == 'PUT':
        try:
            user = request.user

            user_model = UserModel.objects.filter(user=user, file_id=file_id).first()
            if not user_model:
                return JsonResponse({
                    'success': False,
                    'error': 'The model was not found or does not belong to your account'
                }, status=404)

            user_model.is_public = not user_model.is_public

            if not user_model.is_public:
                user_model.public_view_count = 0
            
            user_model.updated_at = timezone.now()
            user_model.save()
            
            return JsonResponse({
                'success': True,
                'message': f'The model is now {"public" if user_model.is_public else "privat"}',
                'is_public': user_model.is_public,
                'public_view_count': getattr(user_model, 'public_view_count', 0)
            })
            
        except Exception as e:
            print(f" Error toggling visibility: {str(e)}")
            return JsonResponse({
                'success': False,
                'error': f'Error toggling visibility: {str(e)}'
            }, status=500)
    
    return JsonResponse({
        'success': False,
        'error': 'Only the PUT method is allowed'
    }, status=405)




@token_required
def get_project_camera_position(request, file_id):
    try:
        user = request.user
        user_model = UserModel.objects.filter(user=user, file_id=file_id).first()
        
        if not user_model:
            return JsonResponse({
                'success': False,
                'error': 'The project was not found'
            }, status=404)

        default_camera = {
            'position': [0, -2000, 2000],
            'target': [0, 0, 0],
            'fov': 45
        }
        
        return JsonResponse({
            'success': True,
            'camera_position': user_model.camera_position or default_camera
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Error retrieving the camera position: {str(e)}'
        }, status=500)

@csrf_exempt
def get_workshop_stats(request):
    try:
        total_models = 0
        total_views = 0
        total_downloads = 0
        total_favorites = 0
        
        all_models = UserModel.objects.all()
        
        for model in all_models:
            if getattr(model, 'is_public', False):
                total_models += 1
                total_views += getattr(model, 'public_view_count', 0)
                total_downloads += getattr(model, 'download_count', 0)
                total_favorites += len(model.favorites or [])
        
        unique_creators = set()
        for model in all_models:
            if getattr(model, 'is_public', False) and model.user:
                unique_creators.add(model.user.id)
        
        total_creators = len(unique_creators)

        from django.utils import timezone
        now = timezone.now()
        last_24_hours = now - timedelta(hours=24)
        
        new_models_24h = 0
        new_creators_24h = set()
        
        for model in all_models:
            if getattr(model, 'is_public', False) and model.created_at:

                created_at = model.created_at
                if timezone.is_naive(created_at):
                    created_at = timezone.make_aware(created_at)
                
                if created_at >= last_24_hours:
                    new_models_24h += 1
                    if model.user:
                        new_creators_24h.add(model.user.id)
        
        stats = {
            'total_models': total_models,
            'total_creators': total_creators,
            'total_views': total_views,
            'total_downloads': total_downloads,
            'total_favorites': total_favorites,
            
            'new_models_24h': new_models_24h,
            'new_creators_24h': len(new_creators_24h),
            
            'avg_views_per_model': round(total_views / max(total_models, 1), 1),
            'avg_downloads_per_model': round(total_downloads / max(total_models, 1), 1),
            'avg_favorites_per_model': round(total_favorites / max(total_models, 1), 1),
            'most_common_element_type': get_most_common_element_type(all_models)
        }
        
        return JsonResponse({
            'success': True,
            'stats': stats,
            'last_updated': timezone.now().isoformat()
        })
        
    except Exception as e:
        print(f"Error retrieving workshop statistics: {str(e)}")
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': True,
            'stats': {
                'total_models': 0,
                'total_creators': 0,
                'total_views': 0,
                'total_downloads': 0,
                'total_favorites': 0,
                'new_models_24h': 0,
                'new_creators_24h': 0,
                'avg_views_per_model': 0,
                'avg_downloads_per_model': 0,
                'avg_favorites_per_model': 0,
                'most_common_element_type': 'building'
            }
        })


def get_most_common_element_type(models):
    try:
        element_counts = {
            'building': 0,
            'highway': 0,
            'water': 0,
            'natural': 0,
            'landuse': 0,
            'other': 0
        }
        
        for model in models:
            if getattr(model, 'is_public', False):
                element_counts['building'] += getattr(model, 'building_count', 0)
                element_counts['highway'] += getattr(model, 'highway_count', 0)
                element_counts['water'] += getattr(model, 'water_count', 0)
                element_counts['natural'] += getattr(model, 'natural_count', 0)
                element_counts['landuse'] += getattr(model, 'landuse_count', 0)
                element_counts['other'] += getattr(model, 'other_count', 0)
        

        max_count = 0
        most_common = 'building'
        
        for element_type, count in element_counts.items():
            if count > max_count:
                max_count = count
                most_common = element_type
        
        return most_common
        
    except Exception as e:
        return 'building'


@csrf_exempt
def get_featured_models(request):

    try:

        all_models = UserModel.objects.all()
        public_models = []
        
        for model in all_models:
            if getattr(model, 'is_public', False):
                public_models.append(model)

        def calculate_score(model):
            views = getattr(model, 'public_view_count', 0)
            downloads = getattr(model, 'download_count', 0)
            favorites = len(model.favorites or [])
            
            recency_score = 0
            if model.created_at:
                from django.utils import timezone
                now = timezone.now()
                created = model.created_at
                
                if timezone.is_naive(created):
                    created = timezone.make_aware(created)
                
                hours_since_creation = (now - created).total_seconds() / 3600
                if hours_since_creation < 168:
                    recency_score = 100 * (1 - (hours_since_creation / 168))
            
            return (views * 1.0) + (downloads * 2.0) + (favorites * 3.0) + recency_score
        
        public_models.sort(key=lambda x: calculate_score(x), reverse=True)
        
        featured_models = public_models[:4]
        
        models_data = []
        for model in featured_models:

            thumbnail_url = None
            if model.thumbnail:
                try:
                    thumbnail_url = model.thumbnail.url
                except:
                    thumbnail_url = f'/api/project/{model.file_id}/thumbnail/image/'
            else:
                thumbnail_url = f'/api/project/{model.file_id}/thumbnail/image/'
            

            favorites_count = len(model.favorites or []) if hasattr(model, 'favorites') else 0
            

            is_favorited = False
            try:
                auth_header = request.headers.get('Authorization', '')
                if auth_header.startswith('Bearer '):
                    token_str = auth_header.split(' ')[1]
                    auth_token = AuthToken.objects.get(
                        token=token_str,
                        expires_at__gt=timezone.now()
                    )
                    user = auth_token.user
                    is_favorited = str(user.id) in (model.favorites or [])
            except:
                pass
            
            models_data.append({
                'id': str(model.id),
                'file_id': model.file_id,
                'title': model.title or f"Model {model.file_id}",
                'description': model.description or 'No description added',
                'thumbnail': thumbnail_url,
                'created_at': model.created_at.isoformat() if model.created_at else timezone.now().isoformat(),
                'views': getattr(model, 'public_view_count', 0),
                'downloads': getattr(model, 'download_count', 0),
                'favorites_count': favorites_count,
                'is_favorited': is_favorited,
                'owner': {
                    'id': str(model.user.id),
                    'username': model.user.username,
                    'profile_picture': get_user_profile_picture_url(model.user)
                }
            })
        
        return JsonResponse({
            'success': True,
            'models': models_data,
            'count': len(models_data)
        })
        
    except Exception as e:
        print(f"Error retrieving recommended models: {str(e)}")
        import traceback
        traceback.print_exc()
        
        return JsonResponse({
            'success': True,
            'models': [],
            'count': 0
        })


def get_user_profile_picture_url(user):
    try:
        if user.profile_picture:
            return user.profile_picture.url
    except:
        pass
    
    return 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcStltpfa69E9JTQOf5ZcyLGR8meBbxMFJxM0w&s'

@csrf_exempt
@token_required
def delete_account(request):
    if request.method == 'DELETE':
        try:
            user = request.user
            data = json.loads(request.body)
            password = data.get('password')
            
            if not password:
                return JsonResponse({
                    'success': False,
                    'error': 'Password is required to confirm account deletion'
                }, status=400)
            
            if not user.check_password(password):
                return JsonResponse({
                    'success': False,
                    'error': 'Incorrect password'
                }, status=400)
            
            user_models = UserModel.objects.filter(user=user)
            
            for user_model in user_models:
                try:
                    json_filename = os.path.join(settings.MEDIA_ROOT, 'models', f'{user_model.file_id}.json')
                    if os.path.exists(json_filename):
                        os.remove(json_filename)
                    
                    glb_filename = os.path.join(settings.MEDIA_ROOT, 'exports', 'user_exports', f'{user_model.file_id}.glb')
                    if os.path.exists(glb_filename):
                        os.remove(glb_filename)
                    
                    glb_export_filename = os.path.join(settings.MEDIA_ROOT, 'exports', 'user_exports', f'export_{user_model.file_id}.glb')
                    if os.path.exists(glb_export_filename):
                        os.remove(glb_export_filename)
                    
                    if user_model.thumbnail:
                        thumbnail_path = user_model.thumbnail.path
                        if os.path.exists(thumbnail_path):
                            os.remove(thumbnail_path)
                    
                    if user_model.glb_file and user_model.glb_file.name:
                        try:
                            if default_storage.exists(user_model.glb_file.name):
                                default_storage.delete(user_model.glb_file.name)
                        except Exception as e:
                            print(f"Error deleting GLB file for {user_model.file_id}: {str(e)}")
                    
                    user_model.favorites.clear()
                    user_model.delete()
                    
                except Exception as e:
                    print(f"Error deleting model {user_model.file_id}: {str(e)}")
                    continue
            
            if user.profile_picture:
                try:
                    profile_picture_path = user.profile_picture.path
                    if os.path.exists(profile_picture_path):
                        os.remove(profile_picture_path)
                        
                    profile_picture_dir = os.path.dirname(profile_picture_path)
                    if os.path.exists(profile_picture_dir):
                        os.rmdir(profile_picture_dir)
                        
                    user_profile_dir = os.path.dirname(profile_picture_dir)
                    if os.path.exists(user_profile_dir):
                        try:
                            os.rmdir(user_profile_dir)
                        except:
                            pass
                except Exception as e:
                    print(f"Error deleting profile picture: {str(e)}")
            
            AuthToken.objects.filter(user=user).delete()
            
            user.delete()
            
            return JsonResponse({
                'success': True,
                'message': 'Account deleted successfully. All your data has been permanently removed.'
            })
            
        except json.JSONDecodeError:
            return JsonResponse({
                'success': False,
                'error': 'Invalid JSON data'
            }, status=400)
        except Exception as e:
            print(f"Error deleting account: {str(e)}")
            import traceback
            traceback.print_exc()
            return JsonResponse({
                'success': False,
                'error': f'Error deleting account: {str(e)}'
            }, status=500)
    
    return JsonResponse({
        'success': False,
        'error': 'Only the DELETE method is allowed'
    }, status=405)

# ==================== PAGES (HTML Templates) ====================

@swagger_auto_schema(
    method='get',
    operation_summary="Intro/Landing page",
    operation_description="Returns the main landing page with platform introduction and 3D animation",
    tags=['Pages'],
    responses={200: 'HTML landing page'}
)
@api_view(['GET'])
def doc_intro(request):
    return Response({
        'endpoint': '/',
        'method': 'GET',
        'description': 'Intro/Landing page',
        'type': 'HTML',
        'template': 'Intro.html',
        'features': ['Three.js animation', 'Service Worker registration', 'Responsive design']
    })


@swagger_auto_schema(
    method='get',
    operation_summary="Home page with map interface",
    operation_description="Main page where users select geographic area and generate 3D models",
    tags=['Pages'],
    responses={200: 'HTML home page with Leaflet map'}
)
@api_view(['GET'])
def doc_home(request):
    return Response({
        'endpoint': '/home/',
        'method': 'GET',
        'description': 'Home page with map interface',
        'type': 'HTML',
        'template': 'home.html',
        'features': ['Leaflet map', 'Area selection', 'Overpass API integration', '3D model generation']
    })


@swagger_auto_schema(
    method='get',
    operation_summary="Authentication page",
    operation_description="Login and registration page with form validation",
    tags=['Pages'],
    responses={200: 'HTML auth page'}
)
@api_view(['GET'])
def doc_auth(request):
    return Response({
        'endpoint': '/auth/',
        'method': 'GET',
        'description': 'Authentication page (login/register forms)',
        'type': 'HTML',
        'template': 'auth.html',
        'features': ['Login form', 'Registration form', 'Password strength meter', 'JWT token storage']
    })


@swagger_auto_schema(
    method='get',
    operation_summary="User account dashboard",
    operation_description="User profile management, model listing, and statistics",
    tags=['Pages'],
    responses={200: 'HTML account page'}
)
@api_view(['GET'])
def doc_account(request):
    return Response({
        'endpoint': '/account/',
        'method': 'GET',
        'description': 'User account dashboard page',
        'type': 'HTML',
        'template': 'account.html',
        'features': ['Profile management', 'Model list with pagination', 'Favorites', 'Statistics charts']
    })


@swagger_auto_schema(
    method='get',
    operation_summary="Public models workshop",
    operation_description="Gallery of public 3D models with search and filtering",
    tags=['Pages'],
    responses={200: 'HTML workshop page'}
)
@api_view(['GET'])
def doc_workshop(request):
    return Response({
        'endpoint': '/workshop/',
        'method': 'GET',
        'description': 'Public models workshop/gallery page',
        'type': 'HTML',
        'template': 'workshop.html',
        'features': ['Model grid', 'Search', 'Filter by type', 'Sort by views/downloads/favorites']
    })


@swagger_auto_schema(
    method='get',
    operation_summary="3D viewer page",
    operation_description="Interactive 3D model viewer with editing capabilities",
    tags=['Pages'],
    responses={200: 'HTML 3D viewer page'}
)
@api_view(['GET'])
def doc_view_3d(request, file_id=None):
    return Response({
        'endpoint': f'/view-3d/{file_id or "{file_id}"}/',
        'method': 'GET',
        'description': '3D viewer page for specific model',
        'type': 'HTML',
        'template': 'view_3d.html',
        'parameters': {
            'file_id': {
                'type': 'string',
                'required': True,
                'description': 'Model identifier',
                'example': 'project_abc123'
            }
        },
        'features': ['Three.js viewer', 'OrbitControls', 'Model editing', 'Export to GLB']
    })


@swagger_auto_schema(
    method='get',
    operation_summary="Offline fallback page",
    operation_description="Displayed by Service Worker when user is offline",
    tags=['Pages'],
    responses={200: 'HTML offline page'}
)
@api_view(['GET'])
def doc_offline(request):
    return Response({
        'endpoint': '/offline/',
        'method': 'GET',
        'description': 'Offline fallback page (PWA)',
        'type': 'HTML',
        'template': 'offline.html',
        'features': ['Offline notification', 'Retry connection button', 'Cache management']
    })


# ==================== AUTHENTICATION ====================

@swagger_auto_schema(
    method='post',
    operation_summary="Register new user",
    operation_description="Creates a new user account and returns an authentication token valid for 30 days",
    tags=['Authentication'],
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        required=['username', 'email', 'password'],
        properties={
            'username': openapi.Schema(type=openapi.TYPE_STRING, minLength=3, description='Unique username'),
            'email': openapi.Schema(type=openapi.TYPE_STRING, format='email', description='Valid email address'),
            'password': openapi.Schema(type=openapi.TYPE_STRING, minLength=6, description='Password (min 6 characters)'),
        }
    ),
    responses={
        200: openapi.Response('Account created successfully', openapi.Schema(
            type=openapi.TYPE_OBJECT,
            properties={
                'success': openapi.Schema(type=openapi.TYPE_BOOLEAN, example=True),
                'message': openapi.Schema(type=openapi.TYPE_STRING, example='Account created successfully!'),
                'user': openapi.Schema(type=openapi.TYPE_OBJECT, properties={
                    'id': openapi.Schema(type=openapi.TYPE_STRING, format='uuid'),
                    'username': openapi.Schema(type=openapi.TYPE_STRING),
                    'email': openapi.Schema(type=openapi.TYPE_STRING, format='email'),
                }),
                'token': openapi.Schema(type=openapi.TYPE_STRING, description='JWT token for authentication'),
                'expires_at': openapi.Schema(type=openapi.TYPE_STRING, format='date-time'),
            }
        )),
        400: 'Bad request - missing fields or validation error'
    }
)
@api_view(['POST'])
def doc_register(request):
    return Response({
        'endpoint': '/auth/register/',
        'method': 'POST',
        'authentication': 'Not required',
        'content_type': 'application/json',
        'request_body': {
            'username': {'type': 'string', 'minLength': 3, 'required': True, 'example': 'john_doe'},
            'email': {'type': 'string', 'format': 'email', 'required': True, 'example': 'john@example.com'},
            'password': {'type': 'string', 'minLength': 6, 'required': True, 'example': 'securepass123'}
        },
        'response': {
            'success': 'boolean',
            'message': 'Account created successfully!',
            'user': {'id': 'uuid', 'username': 'string', 'email': 'string'},
            'token': 'string (JWT)',
            'expires_at': 'ISO date (30 days from creation)'
        },
        'error_responses': {
            400: {'success': False, 'error': 'Username already taken | Email already registered | Password too short'}
        }
    })


@swagger_auto_schema(
    method='post',
    operation_summary="Login user",
    operation_description="Authenticates user and returns JWT token for subsequent API calls",
    tags=['Authentication'],
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        required=['email', 'password'],
        properties={
            'email': openapi.Schema(type=openapi.TYPE_STRING, format='email', description='Registered email address'),
            'password': openapi.Schema(type=openapi.TYPE_STRING, description='Account password'),
        }
    ),
    responses={
        200: openapi.Response('Login successful', openapi.Schema(
            type=openapi.TYPE_OBJECT,
            properties={
                'success': openapi.Schema(type=openapi.TYPE_BOOLEAN, example=True),
                'message': openapi.Schema(type=openapi.TYPE_STRING, example='Login successful!'),
                'user': openapi.Schema(type=openapi.TYPE_OBJECT, properties={
                    'id': openapi.Schema(type=openapi.TYPE_STRING, format='uuid'),
                    'username': openapi.Schema(type=openapi.TYPE_STRING),
                    'email': openapi.Schema(type=openapi.TYPE_STRING, format='email'),
                    'models_count': openapi.Schema(type=openapi.TYPE_INTEGER),
                }),
                'token': openapi.Schema(type=openapi.TYPE_STRING),
                'expires_at': openapi.Schema(type=openapi.TYPE_STRING, format='date-time'),
            }
        )),
        401: 'Invalid credentials'
    }
)
@api_view(['POST'])
def doc_login(request):
    return Response({
        'endpoint': '/auth/login/',
        'method': 'POST',
        'authentication': 'Not required',
        'content_type': 'application/json',
        'request_body': {
            'email': {'type': 'string', 'format': 'email', 'required': True, 'example': 'john@example.com'},
            'password': {'type': 'string', 'required': True, 'example': 'securepass123'}
        },
        'response': {
            'success': 'boolean',
            'message': 'Login successful!',
            'user': {'id': 'uuid', 'username': 'string', 'email': 'string', 'models_count': 'integer'},
            'token': 'string (JWT)',
            'expires_at': 'ISO date'
        },
        'error_responses': {
            401: {'success': False, 'error': 'Invalid credentials | Account deactivated'}
        }
    })


@swagger_auto_schema(
    method='delete',
    operation_summary="Logout user",
    operation_description="Invalidates the current authentication token",
    tags=['Authentication'],
    manual_parameters=[
        openapi.Parameter('Authorization', openapi.IN_HEADER, type=openapi.TYPE_STRING, required=True, description='Bearer <token>')
    ],
    responses={
        200: openapi.Response('Successfully logged out', openapi.Schema(
            type=openapi.TYPE_OBJECT,
            properties={
                'success': openapi.Schema(type=openapi.TYPE_BOOLEAN, example=True),
                'message': openapi.Schema(type=openapi.TYPE_STRING, example='Successfully logged out'),
            }
        )),
        401: 'Unauthorized - Invalid or missing token'
    }
)
@api_view(['DELETE'])
def doc_logout(request):
    return Response({
        'endpoint': '/auth/logout/',
        'method': 'DELETE',
        'authentication': 'Bearer token required',
        'headers': {'Authorization': 'Bearer <token>'},
        'response': {'success': True, 'message': 'Successfully logged out'},
        'error_responses': {401: {'success': False, 'error': 'Invalid or expired token'}}
    })


@swagger_auto_schema(
    method='get',
    operation_summary="Get user profile",
    operation_description="Returns current user's profile information",
    tags=['Authentication'],
    manual_parameters=[
        openapi.Parameter('Authorization', openapi.IN_HEADER, type=openapi.TYPE_STRING, required=True, description='Bearer <token>')
    ],
    responses={
        200: openapi.Response('User profile data', openapi.Schema(
            type=openapi.TYPE_OBJECT,
            properties={
                'success': openapi.Schema(type=openapi.TYPE_BOOLEAN, example=True),
                'user': openapi.Schema(type=openapi.TYPE_OBJECT, properties={
                    'id': openapi.Schema(type=openapi.TYPE_STRING, format='uuid'),
                    'username': openapi.Schema(type=openapi.TYPE_STRING),
                    'email': openapi.Schema(type=openapi.TYPE_STRING, format='email'),
                    'profile_picture': openapi.Schema(type=openapi.TYPE_STRING, format='uri'),
                    'models_count': openapi.Schema(type=openapi.TYPE_INTEGER),
                    'created_at': openapi.Schema(type=openapi.TYPE_STRING, format='date-time'),
                })
            }
        )),
        401: 'Unauthorized'
    }
)
@api_view(['GET'])
def doc_get_profile(request):
    return Response({
        'endpoint': '/auth/profile/',
        'method': 'GET',
        'authentication': 'Bearer token required',
        'headers': {'Authorization': 'Bearer <token>'},
        'response': {
            'success': True,
            'user': {
                'id': 'uuid',
                'username': 'string',
                'email': 'string',
                'profile_picture': 'url (or default)',
                'models_count': 'integer',
                'created_at': 'ISO date'
            }
        },
        'error_responses': {401: {'success': False, 'error': 'Invalid or expired token'}}
    })


# ==================== ACCOUNT MANAGEMENT ====================

@swagger_auto_schema(
    method='put',
    operation_summary="Update user profile",
    operation_description="Updates username, email, or profile picture",
    tags=['Account'],
    manual_parameters=[
        openapi.Parameter('Authorization', openapi.IN_HEADER, type=openapi.TYPE_STRING, required=True, description='Bearer <token>')
    ],
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'username': openapi.Schema(type=openapi.TYPE_STRING, description='New username (optional)'),
            'email': openapi.Schema(type=openapi.TYPE_STRING, format='email', description='New email (optional)'),
            'profile_picture': openapi.Schema(type=openapi.TYPE_STRING, description='Profile picture file (optional)'),
        }
    ),
    responses={
        200: 'Profile updated successfully',
        400: 'Bad request - duplicate username/email',
        401: 'Unauthorized'
    }
)
@api_view(['PUT'])
def doc_update_profile(request):
    return Response({
        'endpoint': '/api/account/profile/',
        'method': 'PUT',
        'authentication': 'Bearer token required',
        'content_type': 'multipart/form-data',
        'request_body': {
            'username': {'type': 'string', 'minLength': 3, 'required': False},
            'email': {'type': 'string', 'format': 'email', 'required': False},
            'profile_picture': {'type': 'file', 'format': 'binary', 'required': False}
        },
        'response': {
            'success': True,
            'message': 'Profile updated successfully',
            'user': {'id': 'uuid', 'username': 'string', 'email': 'string', 'profile_picture': 'url', 'models_count': 'integer'}
        },
        'error_responses': {
            400: {'success': False, 'error': 'The username is already taken'},
            401: {'success': False, 'error': 'Invalid or expired token'}
        }
    })


@swagger_auto_schema(
    method='put',
    operation_summary="Change password",
    operation_description="Changes user password and invalidates all existing tokens",
    tags=['Account'],
    manual_parameters=[
        openapi.Parameter('Authorization', openapi.IN_HEADER, type=openapi.TYPE_STRING, required=True, description='Bearer <token>')
    ],
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        required=['current_password', 'new_password'],
        properties={
            'current_password': openapi.Schema(type=openapi.TYPE_STRING, description='Current password'),
            'new_password': openapi.Schema(type=openapi.TYPE_STRING, minLength=6, description='New password (min 6 chars)'),
        }
    ),
    responses={
        200: 'Password changed successfully',
        400: 'Invalid current password',
        401: 'Unauthorized'
    }
)
@api_view(['PUT'])
def doc_change_password(request):
    return Response({
        'endpoint': '/api/account/password/',
        'method': 'PUT',
        'authentication': 'Bearer token required',
        'content_type': 'application/json',
        'request_body': {
            'current_password': {'type': 'string', 'required': True},
            'new_password': {'type': 'string', 'minLength': 6, 'required': True}
        },
        'response': {
            'success': True,
            'message': 'The password has been changed successfully. Please sign in again.'
        },
        'error_responses': {
            400: {'success': False, 'error': 'The current password is incorrect | Password too short'},
            401: {'success': False, 'error': 'Invalid or expired token'}
        }
    })


@swagger_auto_schema(
    method='get',
    operation_summary="Get account statistics",
    operation_description="Returns aggregated statistics for user account",
    tags=['Account'],
    manual_parameters=[
        openapi.Parameter('Authorization', openapi.IN_HEADER, type=openapi.TYPE_STRING, required=True, description='Bearer <token>')
    ],
    responses={200: 'Account statistics'}
)
@api_view(['GET'])
def doc_account_stats(request):
    return Response({
        'endpoint': '/api/account/stats/',
        'method': 'GET',
        'authentication': 'Bearer token required',
        'response': {
            'success': True,
            'stats': {
                'total_models': 'integer',
                'public_models': 'integer',
                'private_models': 'integer',
                'storage_used_mb': 'float',
                'models_this_month': 'integer',
                'total_elements': 'integer',
                'total_area_km2': 'float',
                'total_buildings': 'integer',
                'total_highways': 'integer',
                'total_water': 'integer',
                'total_natural': 'integer',
                'total_landuse': 'integer',
                'total_other': 'integer',
                'buildings_percentage': 'float',
                'highways_percentage': 'float',
                'water_percentage': 'float',
                'element_summary': {
                    'buildings': 'integer',
                    'roads': 'integer',
                    'water': 'integer',
                    'natural': 'integer',
                    'landuse': 'integer',
                    'other': 'integer'
                }
            }
        }
    })


@swagger_auto_schema(
    method='get',
    operation_summary="Get detailed user models",
    operation_description="Returns list of user's models with detailed statistics",
    tags=['Account'],
    manual_parameters=[
        openapi.Parameter('Authorization', openapi.IN_HEADER, type=openapi.TYPE_STRING, required=True, description='Bearer <token>')
    ],
    responses={200: 'List of user models'}
)
@api_view(['GET'])
def doc_user_models_detailed(request):
    return Response({
        'endpoint': '/api/account/models/detailed/',
        'method': 'GET',
        'authentication': 'Bearer token required',
        'response': {
            'success': True,
            'models': [
                {
                    'id': 'uuid',
                    'title': 'string',
                    'description': 'string',
                    'file_id': 'string',
                    'thumbnail': 'url',
                    'created_at': 'ISO date',
                    'is_public': 'boolean',
                    'views': 'integer',
                    'downloads': 'integer',
                    'stats': {
                        'total_elements': 'integer',
                        'buildings': 'integer',
                        'highways': 'integer',
                        'water': 'integer',
                        'natural': 'integer',
                        'landuse': 'integer',
                        'other': 'integer',
                        'file_size_mb': 'float',
                        'area_km2': 'float'
                    },
                    'has_glb_export': 'boolean'
                }
            ],
            'total': 'integer'
        }
    })


@swagger_auto_schema(
    method='get',
    operation_summary="Get user favorites",
    operation_description="Returns list of models favorited by user",
    tags=['Account'],
    manual_parameters=[
        openapi.Parameter('Authorization', openapi.IN_HEADER, type=openapi.TYPE_STRING, required=True, description='Bearer <token>')
    ],
    responses={200: 'List of favorite models'}
)
@api_view(['GET'])
def doc_user_favorites(request):
    return Response({
        'endpoint': '/api/account/favorites/',
        'method': 'GET',
        'authentication': 'Bearer token required',
        'response': {
            'success': True,
            'favorites': [
                {
                    'id': 'uuid',
                    'file_id': 'string',
                    'title': 'string',
                    'description': 'string',
                    'thumbnail': 'url',
                    'created_at': 'ISO date',
                    'is_public': 'boolean',
                    'views': 'integer',
                    'downloads': 'integer',
                    'favorites_count': 'integer',
                    'owner': {
                        'id': 'uuid',
                        'username': 'string',
                        'profile_picture': 'url'
                    },
                    'stats': {
                        'total_elements': 'integer',
                        'building_count': 'integer',
                        'highway_count': 'integer',
                        'water_count': 'integer',
                        'natural_count': 'integer',
                        'file_size_mb': 'float'
                    }
                }
            ],
            'total': 'integer'
        }
    })


@swagger_auto_schema(
    method='delete',
    operation_summary="Delete user account",
    operation_description="Permanently deletes user account and all associated data",
    tags=['Account'],
    manual_parameters=[
        openapi.Parameter('Authorization', openapi.IN_HEADER, type=openapi.TYPE_STRING, required=True, description='Bearer <token>')
    ],
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        required=['password'],
        properties={
            'password': openapi.Schema(type=openapi.TYPE_STRING, description='Password confirmation'),
        }
    ),
    responses={
        200: 'Account deleted successfully',
        400: 'Incorrect password',
        401: 'Unauthorized'
    }
)
@api_view(['DELETE'])
def doc_delete_account(request):
    return Response({
        'endpoint': '/api/account/delete/',
        'method': 'DELETE',
        'authentication': 'Bearer token required',
        'request_body': {'password': {'type': 'string', 'required': True}},
        'response': {
            'success': True,
            'message': 'Account deleted successfully. All your data has been permanently removed.'
        },
        'error_responses': {
            400: {'success': False, 'error': 'Incorrect password'},
            401: {'success': False, 'error': 'Invalid or expired token'}
        }
    })

# ==================== MODEL MANAGEMENT ====================

@swagger_auto_schema(
    method='post',
    operation_summary="Save building data",
    operation_description="Saves GeoJSON building data and optional GLB model",
    tags=['Model Management'],
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        required=['geojson'],
        properties={
            'file_id': openapi.Schema(type=openapi.TYPE_STRING, description='Project identifier (optional, auto-generated)'),
            'dataType': openapi.Schema(type=openapi.TYPE_STRING, enum=['building', 'highway', 'water', 'natural', 'landuse', 'other']),
            'geojson': openapi.Schema(type=openapi.TYPE_OBJECT, description='GeoJSON FeatureCollection'),
            'glb_data': openapi.Schema(type=openapi.TYPE_STRING, description='Base64 encoded GLB file'),
            'bounds': openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    'north': openapi.Schema(type=openapi.TYPE_NUMBER),
                    'south': openapi.Schema(type=openapi.TYPE_NUMBER),
                    'east': openapi.Schema(type=openapi.TYPE_NUMBER),
                    'west': openapi.Schema(type=openapi.TYPE_NUMBER),
                }
            ),
            'origin': openapi.Schema(type=openapi.TYPE_ARRAY, items=openapi.Schema(type=openapi.TYPE_NUMBER)),
        }
    ),
    responses={200: 'Data saved successfully'}
)
@api_view(['POST'])
def doc_save_data(request):
    return Response({
        'endpoint': '/api/save-data/',
        'method': 'POST',
        'authentication': 'Bearer token optional (saves to account if provided)',
        'request_body': {
            'file_id': {'type': 'string', 'required': False},
            'dataType': {'type': 'string', 'enum': ['building', 'highway', 'water', 'natural', 'landuse', 'other'], 'required': False},
            'geojson': {'type': 'object', 'required': True, 'description': 'GeoJSON FeatureCollection'},
            'glb_data': {'type': 'string', 'required': False, 'description': 'Base64 encoded GLB'},
            'bounds': {'type': 'object', 'required': False},
            'origin': {'type': 'array', 'required': False}
        },
        'response': {
            'success': True,
            'file_id': 'string',
            'building_count': 'integer',
            'data_type': 'string',
            'processing_time': 'string (e.g., "1.23s")',
            'glb_saved': 'boolean',
            'saved_to_account': 'boolean'
        }
    })


@swagger_auto_schema(
    method='post',
    operation_summary="Save GLB export",
    operation_description="Saves GLB model with thumbnail and metadata",
    tags=['Model Management'],
    manual_parameters=[
        openapi.Parameter('Authorization', openapi.IN_HEADER, type=openapi.TYPE_STRING, required=True, description='Bearer <token>')
    ],
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'glb_file': openapi.Schema(type=openapi.TYPE_FILE, description='GLB file (required)'),
            'thumbnail_data': openapi.Schema(type=openapi.TYPE_STRING, description='Base64 encoded thumbnail image'),
            'file_id': openapi.Schema(type=openapi.TYPE_STRING),
            'project_name': openapi.Schema(type=openapi.TYPE_STRING),
            'element_count': openapi.Schema(type=openapi.TYPE_INTEGER),
        }
    ),
    responses={200: 'Export saved'}
)
@api_view(['POST'])
def doc_save_export(request):
    return Response({
        'endpoint': '/api/save-export/',
        'method': 'POST',
        'authentication': 'Bearer token required',
        'content_type': 'multipart/form-data',
        'fields': {
            'glb_file': {'type': 'file', 'required': True, 'accept': '.glb'},
            'thumbnail_data': {'type': 'string', 'required': False, 'description': 'Base64 image'},
            'file_id': {'type': 'string', 'required': False},
            'project_name': {'type': 'string', 'required': False},
            'element_count': {'type': 'integer', 'required': False},
            'building_count': {'type': 'integer', 'required': False},
            'highway_count': {'type': 'integer', 'required': False},
            'water_count': {'type': 'integer', 'required': False},
            'natural_count': {'type': 'integer', 'required': False},
            'landuse_count': {'type': 'integer', 'required': False},
            'other_count': {'type': 'integer', 'required': False},
            'file_size_mb': {'type': 'number', 'required': False}
        },
        'response': {
            'success': True,
            'message': 'Project created/updated successfully!',
            'file_id': 'string',
            'action': 'create | update',
            'user_models_count': 'integer',
            'thumbnail_saved': 'boolean',
            'thumbnail_url': 'url',
            'project_info': {
                'element_count': 'integer',
                'building_count': 'integer',
                'file_size_mb': 'float'
            }
        }
    })


@swagger_auto_schema(
    method='put',
    operation_summary="Update model metadata",
    operation_description="Updates model title and description",
    tags=['Model Management'],
    manual_parameters=[
        openapi.Parameter('Authorization', openapi.IN_HEADER, type=openapi.TYPE_STRING, required=True, description='Bearer <token>')
    ],
    responses={200: 'Model updated successfully'}
)
@api_view(['PUT'])
def doc_update_model(request, file_id=None):
    return Response({
        'endpoint': f'/api/account/model/{file_id or "{file_id}"}/update/',
        'method': 'PUT',
        'authentication': 'Bearer token required',
        'path_parameters': {'file_id': {'type': 'string', 'required': True}},
        'request_body': {
            'title': {'type': 'string', 'required': False},
            'description': {'type': 'string', 'required': False}
        },
        'response': {
            'success': True,
            'message': 'Model updated successfully (title, description)',
            'model': {
                'file_id': 'string',
                'title': 'string',
                'is_public': 'boolean',
                'public_view_count': 'integer',
                'description': 'string'
            }
        }
    })


@swagger_auto_schema(
    method='delete',
    operation_summary="Delete model",
    operation_description="Permanently deletes a user model and all associated files",
    tags=['Model Management'],
    manual_parameters=[
        openapi.Parameter('Authorization', openapi.IN_HEADER, type=openapi.TYPE_STRING, required=True, description='Bearer <token>')
    ],
    responses={200: 'Model deleted successfully'}
)
@api_view(['DELETE'])
def doc_delete_model(request, file_id=None):
    return Response({
        'endpoint': f'/api/account/model/{file_id or "{file_id}"}/delete/',
        'method': 'DELETE',
        'authentication': 'Bearer token required',
        'path_parameters': {'file_id': {'type': 'string', 'required': True}},
        'response': {
            'success': True,
            'message': 'Model deleted successfully',
            'remaining_models': 'integer'
        }
    })


@swagger_auto_schema(
    method='put',
    operation_summary="Toggle model visibility",
    operation_description="Makes model public or private",
    tags=['Model Management'],
    manual_parameters=[
        openapi.Parameter('Authorization', openapi.IN_HEADER, type=openapi.TYPE_STRING, required=True, description='Bearer <token>')
    ],
    responses={200: 'Visibility toggled successfully'}
)
@api_view(['PUT'])
def doc_toggle_visibility(request, file_id=None):
    return Response({
        'endpoint': f'/api/account/model/{file_id or "{file_id}"}/toggle-visibility/',
        'method': 'PUT',
        'authentication': 'Bearer token required',
        'path_parameters': {'file_id': {'type': 'string', 'required': True}},
        'response': {
            'success': True,
            'message': 'The model is now public/private',
            'is_public': 'boolean',
            'public_view_count': 'integer (reset to 0 when private)'
        }
    })


# ==================== WORKSHOP ====================

@swagger_auto_schema(
    method='get',
    operation_summary="Get public models",
    operation_description="Returns paginated list of public models with filtering and sorting",
    tags=['Workshop'],
    manual_parameters=[
        openapi.Parameter('page', openapi.IN_QUERY, type=openapi.TYPE_INTEGER, description='Page number', default=1),
        openapi.Parameter('per_page', openapi.IN_QUERY, type=openapi.TYPE_INTEGER, description='Items per page', default=12),
        openapi.Parameter('sort', openapi.IN_QUERY, type=openapi.TYPE_STRING, enum=['newest', 'oldest', 'views', 'elements', 'downloads', 'favorites']),
        openapi.Parameter('search', openapi.IN_QUERY, type=openapi.TYPE_STRING, description='Search in title/description'),
        openapi.Parameter('element_type', openapi.IN_QUERY, type=openapi.TYPE_STRING, enum=['all', 'buildings', 'highways', 'water', 'natural', 'landuse']),
        openapi.Parameter('date_range', openapi.IN_QUERY, type=openapi.TYPE_STRING, enum=['all', 'today', 'week', 'month', 'year']),
    ],
    responses={200: 'List of public models'}
)
@api_view(['GET'])
def doc_public_models(request):
    return Response({
        'endpoint': '/api/public-models/',
        'method': 'GET',
        'query_parameters': {
            'page': {'type': 'integer', 'default': 1},
            'per_page': {'type': 'integer', 'default': 12},
            'sort': {'type': 'string', 'enum': ['newest', 'oldest', 'views', 'elements', 'downloads', 'favorites']},
            'search': {'type': 'string'},
            'element_type': {'type': 'string', 'enum': ['all', 'buildings', 'highways', 'water', 'natural', 'landuse']},
            'date_range': {'type': 'string', 'enum': ['all', 'today', 'week', 'month', 'year']}
        },
        'response': {
            'success': True,
            'models': [
                {
                    'id': 'uuid',
                    'file_id': 'string',
                    'title': 'string',
                    'description': 'string',
                    'thumbnail': 'url',
                    'created_at': 'ISO date',
                    'updated_at': 'ISO date',
                    'is_public': True,
                    'views': 'integer',
                    'downloads': 'integer',
                    'is_favorited': 'boolean (if authenticated)',
                    'favorites_count': 'integer',
                    'is_owner': 'boolean',
                    'stats': {
                        'total_elements': 'integer',
                        'building_count': 'integer',
                        'highway_count': 'integer',
                        'water_count': 'integer',
                        'natural_count': 'integer',
                        'landuse_count': 'integer',
                        'other_count': 'integer',
                        'file_size_mb': 'float',
                        'area_km2': 'float'
                    },
                    'owner': {
                        'id': 'uuid',
                        'username': 'string',
                        'profile_picture': 'url'
                    }
                }
            ],
            'pagination': {
                'current_page': 'integer',
                'per_page': 'integer',
                'total_count': 'integer',
                'total_pages': 'integer',
                'has_previous': 'boolean',
                'has_next': 'boolean'
            }
        }
    })


@swagger_auto_schema(
    method='post',
    operation_summary="Toggle favorite",
    operation_description="Adds or removes a model from user's favorites",
    tags=['Workshop'],
    manual_parameters=[
        openapi.Parameter('Authorization', openapi.IN_HEADER, type=openapi.TYPE_STRING, required=True, description='Bearer <token>')
    ],
    responses={200: 'Favorite toggled'}
)
@api_view(['POST'])
def doc_toggle_favorite(request, file_id=None):
    return Response({
        'endpoint': f'/api/favorite/{file_id or "{file_id}"}/toggle/',
        'method': 'POST',
        'authentication': 'Bearer token required',
        'path_parameters': {'file_id': {'type': 'string', 'required': True}},
        'response': {
            'success': True,
            'message': 'Model added to/removed from favorites',
            'favorited': 'boolean',
            'favorites_count': 'integer',
            'file_id': 'string'
        },
        'error_responses': {
            400: {'success': False, 'error': 'You cannot add your own models to favorites'},
            404: {'success': False, 'error': 'The model was not found'}
        }
    })


@swagger_auto_schema(
    method='get',
    operation_summary="Get workshop statistics",
    operation_description="Returns global statistics about the workshop",
    tags=['Workshop'],
    responses={200: 'Workshop statistics'}
)
@api_view(['GET'])
def doc_workshop_stats(request):
    return Response({
        'endpoint': '/api/workshop-stats/',
        'method': 'GET',
        'response': {
            'success': True,
            'stats': {
                'total_models': 'integer',
                'total_creators': 'integer',
                'total_views': 'integer',
                'total_downloads': 'integer',
                'total_favorites': 'integer',
                'new_models_24h': 'integer',
                'new_creators_24h': 'integer',
                'avg_views_per_model': 'float',
                'avg_downloads_per_model': 'float',
                'avg_favorites_per_model': 'float',
                'most_common_element_type': 'string'
            },
            'last_updated': 'ISO date'
        }
    })


@swagger_auto_schema(
    method='get',
    operation_summary="Get featured models",
    operation_description="Returns top 4 recommended models based on engagement score",
    tags=['Workshop'],
    responses={200: 'Featured models list'}
)
@api_view(['GET'])
def doc_featured_models(request):
    return Response({
        'endpoint': '/api/featured-models/',
        'method': 'GET',
        'response': {
            'success': True,
            'models': [
                {
                    'id': 'uuid',
                    'file_id': 'string',
                    'title': 'string',
                    'description': 'string',
                    'thumbnail': 'url',
                    'created_at': 'ISO date',
                    'views': 'integer',
                    'downloads': 'integer',
                    'favorites_count': 'integer',
                    'is_favorited': 'boolean (if authenticated)',
                    'owner': {
                        'id': 'uuid',
                        'username': 'string',
                        'profile_picture': 'url'
                    }
                }
            ],
            'count': 'integer (max 4)'
        }
    })


# ==================== UTILITIES ====================

@swagger_auto_schema(
    method='get',
    operation_summary="Health check",
    operation_description="Returns service health status",
    tags=['System'],
    responses={200: 'Service healthy'}
)
@api_view(['GET'])
def doc_health(request):
    return Response({
        'endpoint': '/health/',
        'method': 'GET',
        'response': {
            'status': 'healthy',
            'service': 'elmc_3d',
            'timestamp': 'number (Unix timestamp)',
            'version': '2.1.0',
            'features': 'multiple_element_types',
            'max_buildings': 'unlimited',
            'max_file_size': 'unlimited'
        }
    })


@swagger_auto_schema(
    method='get',
    operation_summary="Get building data info",
    operation_description="Returns file info (GLB or JSON available) for given file_id",
    tags=['Data Access'],
    manual_parameters=[
        openapi.Parameter('file_id', openapi.IN_PATH, type=openapi.TYPE_STRING, required=True, description='File identifier'),
    ],
    responses={200: 'File info', 404: 'File not found'}
)
@api_view(['GET'])
def doc_get_building_data(request, file_id):
    return Response({
        'endpoint': f'/api/data/{file_id}/',
        'method': 'GET',
        'path_parameters': {'file_id': {'type': 'string', 'required': True}},
        'response': {
            'success': True,
            'file_id': 'string',
            'file_type': 'glb | json',
            'message': 'The file is available',
            'download_url': 'string',
            'has_json': 'boolean',
            'project_info': {
                'title': 'string',
                'description': 'string',
                'element_count': 'integer',
                'created_at': 'ISO date'
            }
        },
        'error_responses': {404: {'success': False, 'error': 'The file was not found'}}
    })


@swagger_auto_schema(
    method='get',
    operation_summary="Download JSON building data",
    operation_description="Downloads JSON file containing GeoJSON data",
    tags=['Data Access'],
    manual_parameters=[
        openapi.Parameter('file_id', openapi.IN_PATH, type=openapi.TYPE_STRING, required=True, description='File identifier'),
    ],
    responses={200: 'JSON file download', 404: 'File not found'}
)
@api_view(['GET'])
def doc_download_building_data(request, file_id):
    return Response({
        'endpoint': f'/api/download-data/{file_id}/',
        'method': 'GET',
        'path_parameters': {'file_id': {'type': 'string', 'required': True}},
        'response': 'JSON file with Content-Type: application/json',
        'error_responses': {404: {'success': False, 'error': 'The file was not found'}}
    })


@swagger_auto_schema(
    method='post',
    operation_summary="Export GLB file (legacy)",
    operation_description="Legacy endpoint for GLB export",
    tags=['Export'],
    manual_parameters=[
        openapi.Parameter('file_id', openapi.IN_PATH, type=openapi.TYPE_STRING, required=True, description='File identifier'),
    ],
    responses={200: 'GLB file', 500: 'Error generating GLB file'}
)
@api_view(['POST'])
def doc_export_glb(request, file_id):
    return Response({
        'endpoint': f'/api/export/{file_id}/',
        'method': 'POST',
        'path_parameters': {'file_id': {'type': 'string', 'required': True}},
        'response': 'GLB binary file',
        'error_responses': {500: {'success': False, 'error': 'Error generating the GLB file'}}
    })


@swagger_auto_schema(
    method='get',
    operation_summary="Download any file",
    operation_description="Downloads file by filename",
    tags=['Files'],
    manual_parameters=[
        openapi.Parameter('filename', openapi.IN_PATH, type=openapi.TYPE_STRING, required=True, description='Filename'),
    ],
    responses={200: 'File download', 404: 'File not found'}
)
@api_view(['GET'])
def doc_download_file(request, filename):
    return Response({
        'endpoint': f'/api/download/{filename}/',
        'method': 'GET',
        'path_parameters': {'filename': {'type': 'string', 'required': True}},
        'response': 'File binary',
        'error_responses': {404: {'success': False, 'error': 'The file was not found'}}
    })


# ==================== FILES ====================

@swagger_auto_schema(
    method='get',
    operation_summary="Get GLB file (inline view)",
    operation_description="Returns GLB file for inline viewing",
    tags=['Files'],
    manual_parameters=[
        openapi.Parameter('file_id', openapi.IN_PATH, type=openapi.TYPE_STRING, required=True, description='File identifier'),
    ],
    responses={200: 'GLB file', 403: 'Access denied', 404: 'File not found'}
)
@api_view(['GET'])
def doc_get_glb_file(request, file_id):
    return Response({
        'endpoint': f'/api/glb-file/{file_id}/',
        'method': 'GET',
        'path_parameters': {'file_id': {'type': 'string', 'required': True}},
        'authentication': 'Bearer token optional (for private models)',
        'response': 'GLB binary file with Content-Type: model/gltf-binary',
        'error_responses': {
            403: {'success': False, 'error': 'The model is not public or you do not have access'},
            404: {'success': False, 'error': 'The file was not found'}
        }
    })


@swagger_auto_schema(
    method='get',
    operation_summary="Download GLB export file",
    operation_description="Downloads GLB file",
    tags=['Files'],
    manual_parameters=[
        openapi.Parameter('file_id', openapi.IN_PATH, type=openapi.TYPE_STRING, required=True, description='File identifier'),
    ],
    responses={200: 'GLB file download', 403: 'Permission denied', 404: 'File not found'}
)
@api_view(['GET'])
def doc_download_export(request, file_id):
    return Response({
        'endpoint': f'/api/download-export/{file_id}/',
        'method': 'GET',
        'path_parameters': {'file_id': {'type': 'string', 'required': True}},
        'authentication': 'Bearer token required for private models',
        'response': 'GLB binary file with Content-Disposition: attachment',
        'error_responses': {
            403: 'You do not have permission to download this file',
            404: 'The exported file was not found'
        }
    })


@swagger_auto_schema(
    method='get',
    operation_summary="Download model archive (ZIP)",
    operation_description="Downloads ZIP archive containing JSON, GLB and README",
    tags=['Files'],
    manual_parameters=[
        openapi.Parameter('file_id', openapi.IN_PATH, type=openapi.TYPE_STRING, required=True, description='File identifier'),
    ],
    responses={200: 'ZIP archive', 403: 'Access denied', 404: 'Files not found'}
)
@api_view(['GET'])
def doc_download_model_archive(request, file_id):
    return Response({
        'endpoint': f'/api/download-model-archive/{file_id}/',
        'method': 'GET',
        'path_parameters': {'file_id': {'type': 'string', 'required': True}},
        'response': {
            'type': 'ZIP archive',
            'content_type': 'application/zip',
            'contains': ['{file_id}.json', '{file_id}.glb', 'README.txt']
        },
        'error_responses': {
            403: 'The model is not public or you do not have access to it',
            404: 'There are no files available for this model'
        }
    })


# ==================== TEXTURES ====================

@swagger_auto_schema(
    method='get',
    operation_summary="Get texture image",
    operation_description="Returns texture image for 3D elements",
    tags=['Textures'],
    manual_parameters=[
        openapi.Parameter('texture', openapi.IN_QUERY, type=openapi.TYPE_STRING, description='Texture name'),
        openapi.Parameter('face', openapi.IN_QUERY, type=openapi.TYPE_STRING, enum=['top', 'aside', 'side', 'bottom'], description='Face type'),
        openapi.Parameter('type', openapi.IN_QUERY, type=openapi.TYPE_STRING, enum=['building', 'highway', 'water', 'natural', 'landuse', 'other'], description='Element type'),
    ],
    responses={200: 'Texture image', 404: 'Texture not found'}
)
@api_view(['GET'])
def doc_element_texture(request):
    return Response({
        'endpoint': '/api/element-texture/',
        'method': 'GET',
        'query_parameters': {
            'texture': {'type': 'string', 'required': False, 'default': 'default'},
            'face': {'type': 'string', 'enum': ['top', 'aside', 'side', 'bottom'], 'required': False, 'default': 'top'},
            'type': {'type': 'string', 'enum': ['building', 'highway', 'water', 'natural', 'landuse', 'other'], 'required': False, 'default': 'building'}
        },
        'response': 'Image (JPEG/PNG) with Cache-Control: public, max-age=86400',
        'error_responses': {404: {'success': False, 'error': 'Texture not found'}}
    })


@swagger_auto_schema(
    method='get',
    operation_summary="List available textures",
    operation_description="Returns list of all available textures with categories",
    tags=['Textures'],
    responses={200: 'List of textures', 404: 'Textures folder not found'}
)
@api_view(['GET'])
def doc_available_textures(request):
    return Response({
        'endpoint': '/api/available-textures/',
        'method': 'GET',
        'response': {
            'success': True,
            'textures': [
                {
                    'name': 'string',
                    'filename': 'string',
                    'url': 'string',
                    'thumbnail': 'string',
                    'category': 'building | road | water | natural | landuse | other'
                }
            ],
            'grouped_textures': {'category': ['texture1', 'texture2']},
            'total': 'integer'
        }
    })


# ==================== WORKSHOP (additional) ====================

@swagger_auto_schema(
    method='post',
    operation_summary="Increment view count",
    operation_description="Increments view count for public model (owners don't count their own views)",
    tags=['Workshop'],
    manual_parameters=[
        openapi.Parameter('file_id', openapi.IN_PATH, type=openapi.TYPE_STRING, required=True, description='Model identifier'),
    ],
    responses={200: 'View recorded', 404: 'Model not found'}
)
@api_view(['POST'])
def doc_increment_model_view(request, file_id):
    return Response({
        'endpoint': f'/api/public-model/{file_id}/view/',
        'method': 'POST',
        'path_parameters': {'file_id': {'type': 'string', 'required': True}},
        'authentication': 'Bearer token optional (to check ownership)',
        'response': {
            'success': True,
            'message': 'The view has been recorded',
            'file_id': 'string',
            'views': 'integer',
            'is_owner': 'boolean'
        },
        'error_responses': {404: {'success': False, 'error': 'The model was not found or not public'}}
    })


# ==================== PROJECT ====================

@swagger_auto_schema(
    method='put',
    operation_summary="Update project thumbnail",
    operation_description="Updates project thumbnail and camera position",
    tags=['Project'],
    manual_parameters=[
        openapi.Parameter('Authorization', openapi.IN_HEADER, type=openapi.TYPE_STRING, required=True, description='Bearer <token>'),
        openapi.Parameter('file_id', openapi.IN_PATH, type=openapi.TYPE_STRING, required=True, description='File identifier'),
    ],
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        required=['thumbnail_data'],
        properties={
            'thumbnail_data': openapi.Schema(type=openapi.TYPE_STRING, description='Base64 encoded image'),
            'camera_position': openapi.Schema(
                type=openapi.TYPE_OBJECT,
                properties={
                    'position': openapi.Schema(type=openapi.TYPE_ARRAY, items=openapi.Schema(type=openapi.TYPE_NUMBER)),
                    'target': openapi.Schema(type=openapi.TYPE_ARRAY, items=openapi.Schema(type=openapi.TYPE_NUMBER)),
                    'fov': openapi.Schema(type=openapi.TYPE_NUMBER),
                }
            ),
        }
    ),
    responses={200: 'Thumbnail updated', 404: 'Project not found'}
)
@api_view(['PUT'])
def doc_update_project_thumbnail(request, file_id):
    return Response({
        'endpoint': f'/api/project/{file_id}/thumbnail/',
        'method': 'PUT',
        'authentication': 'Bearer token required',
        'path_parameters': {'file_id': {'type': 'string', 'required': True}},
        'request_body': {
            'thumbnail_data': {'type': 'string', 'required': True, 'description': 'Base64 encoded image'},
            'camera_position': {'type': 'object', 'required': False}
        },
        'response': {
            'success': True,
            'message': 'Thumbnail updated successfully',
            'thumbnail_url': 'string'
        },
        'error_responses': {404: {'success': False, 'error': 'The project was not found'}}
    })


@swagger_auto_schema(
    method='get',
    operation_summary="Get project thumbnail image",
    operation_description="Returns thumbnail image for project",
    tags=['Files'],
    manual_parameters=[
        openapi.Parameter('file_id', openapi.IN_PATH, type=openapi.TYPE_STRING, required=True, description='File identifier'),
    ],
    responses={200: 'Thumbnail image', 404: 'Thumbnail not available'}
)
@api_view(['GET'])
def doc_get_project_thumbnail(request, file_id):
    return Response({
        'endpoint': f'/api/project/{file_id}/thumbnail/image/',
        'method': 'GET',
        'path_parameters': {'file_id': {'type': 'string', 'required': True}},
        'response': 'Image (JPEG/PNG) with Cache-Control: public, max-age=86400',
        'error_responses': {404: 'Thumbnail not available, returns default image'}
    })


@swagger_auto_schema(
    method='get',
    operation_summary="Get saved camera position",
    operation_description="Returns saved camera position for project",
    tags=['Project'],
    manual_parameters=[
        openapi.Parameter('Authorization', openapi.IN_HEADER, type=openapi.TYPE_STRING, required=True, description='Bearer <token>'),
        openapi.Parameter('file_id', openapi.IN_PATH, type=openapi.TYPE_STRING, required=True, description='File identifier'),
    ],
    responses={200: 'Camera position data', 404: 'Project not found'}
)
@api_view(['GET'])
def doc_get_camera_position(request, file_id):
    return Response({
        'endpoint': f'/api/project/{file_id}/camera-position/',
        'method': 'GET',
        'authentication': 'Bearer token required',
        'path_parameters': {'file_id': {'type': 'string', 'required': True}},
        'response': {
            'success': True,
            'camera_position': {
                'position': [0, -2000, 2000],
                'target': [0, 0, 0],
                'fov': 45
            }
        },
        'error_responses': {404: {'success': False, 'error': 'The project was not found'}}
    })


# ==================== UTILITIES (additional) ====================

@swagger_auto_schema(
    method='get',
    operation_summary="Clear building data",
    operation_description="Returns info message about auto-storage management",
    tags=['System'],
    responses={200: 'Info message'}
)
@api_view(['GET'])
def doc_clear_data(request):
    return Response({
        'endpoint': '/api/clear-data/',
        'method': 'GET',
        'response': {'success': True, 'message': 'The system manages the storage automatically'}
    })


@swagger_auto_schema(
    method='get',
    operation_summary="Get session information",
    operation_description="Returns session and storage information",
    tags=['System'],
    responses={200: 'Session info'}
)
@api_view(['GET'])
def doc_session_info(request):
    return Response({
        'endpoint': '/api/session-info/',
        'method': 'GET',
        'response': {
            'session_exists': 'boolean',
            'storage_system': 'file_based_optimized',
            'max_file_size': 'unlimited'
        }
    })
    
    
    
def api_docs(request):
    docs = {
        'application': 'ELMC 3D - 3D Modeling Platform',
        'version': '2.1.0',
        'description': 'A platform for creating, sharing, and viewing 3D models from geographic data',
        
        'authentication': {
            'required': 'Bearer token for protected endpoints',
            'token_obtained': 'From /auth/login/ or /auth/register/',
            'token_header': 'Authorization: Bearer <token>'
        },
        'endpoints': {
            'pages': {
                '/': 'Intro page',
                '/home/': 'Home page with map interface',
                '/auth/': 'Authentication page',
                '/account/': 'User account page',
                '/workshop/': 'Public models workshop',
                '/view-3d/<file_id>/': '3D viewer for specific model',
                '/offline/': 'Offline fallback page'
            },
            'authentication': {
                '/auth/register/': 'POST - Register new user',
                '/auth/login/': 'POST - Login user',
                '/auth/logout/': 'DELETE - Logout user',
                '/auth/profile/': 'GET - Get user profile (requires token)',
                '/api/account/delete/': 'DELETE - Delete user account (requires token)'
            },
            'account': {
                '/api/account/profile/': 'PUT - Update user profile',
                '/api/account/password/': 'PUT - Change password',
                '/api/account/stats/': 'GET - Get account statistics',
                '/api/account/models/': 'GET - Get user models (basic)',
                '/api/account/models/detailed/': 'GET - Get detailed user models',
                '/api/account/favorites/': 'GET - Get user favorites'
            },
            'model_management': {
                '/api/account/model/<file_id>/update/': 'PUT - Update model metadata',
                '/api/account/model/<file_id>/delete/': 'DELETE - Delete model',
                '/api/account/model/<file_id>/stats/': 'GET - Get model statistics',
                '/api/account/model/<file_id>/toggle-visibility/': 'PUT - Toggle public/private',
                '/api/save-export/': 'POST - Save GLB export with thumbnail',
                '/api/save-data/': 'POST - Save building data (JSON + optional GLB)'
            },
            'data_access': {
                '/api/data/<file_id>/': 'GET - Get building data info',
                '/api/download-data/<file_id>/': 'GET - Download JSON data',
                '/api/glb-file/<file_id>/': 'GET - Get GLB file (inline view)',
                '/api/download-export/<file_id>/': 'GET - Download GLB file',
                '/api/download/<filename>/': 'GET - Download any file',
                '/api/download-model-archive/<file_id>/': 'GET - Download model archive (ZIP)'
            },
            'export': {
                '/api/export/<file_id>/': 'POST - Export GLB file',
                '/api/save-export/': 'POST - Save GLB export with metadata',
                '/api/save-data/': 'POST - Save building data (with threading)'
            },
            'textures': {
                '/api/element-texture/': 'GET - Serve texture images',
                '/api/available-textures/': 'GET - List available textures'
            },
            'workshop': {
                '/api/public-models/': 'GET - Get public models with pagination',
                '/api/public-model/<file_id>/view/': 'POST - Increment view count',
                '/api/favorite/<file_id>/toggle/': 'POST - Toggle favorite status',
                '/api/workshop-stats/': 'GET - Get workshop statistics',
                '/api/featured-models/': 'GET - Get featured/recommended models'
            },
            'pwa': {
                '/sw.js': 'GET - Service worker root',
                '/manifest.json': 'GET - Web app manifest',
                '/offline/': 'GET - Offline fallback page'
            },
            'system': {
                '/api/clear-data/': 'GET - Clear building data',
                '/api/session-info/': 'GET - Get session information',
                '/health/': 'GET - Health check endpoint',
                '/api/docs/': 'GET - This documentation'
            }
        }
    }
    
    return JsonResponse(docs)