# main/decorators.py
from functools import wraps
from django.http import JsonResponse
from django.utils import timezone
from .models import AuthToken

def admin_required(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token:
            return JsonResponse({'success': False, 'error': 'Authentication required'}, status=401)
        try:
            auth_token = AuthToken.objects.get(token=token, expires_at__gt=timezone.now())
            user = auth_token.user
            if not getattr(user, 'is_admin', False):
                return JsonResponse({'success': False, 'error': 'Admin privileges required'}, status=403)
            request.user = user
            return view_func(request, *args, **kwargs)
        except AuthToken.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Invalid or expired token'}, status=401)
    return wrapper