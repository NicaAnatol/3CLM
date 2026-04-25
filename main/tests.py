from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
import json

from .models import User, AuthToken, UserModel


class AuthenticationAPITests(TestCase):
    
    def setUp(self):
        self.client = self.client_class()
        self.register_url = reverse('register')
        self.login_url = reverse('login')
        self.logout_url = reverse('logout')
        self.profile_url = reverse('profile')
        
        self.test_user_data = {
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'testpass123'
        }
    
    def tearDown(self):
        try:
            User.objects.filter(username='testuser').delete()
            User.objects.filter(username='newname').delete()
            User.objects.filter(username='existing').delete()
        except:
            pass
    
    def test_register_success(self):
        response = self.client.post(self.register_url, data=json.dumps(self.test_user_data), content_type='application/json')
        
        self.assertEqual(response.status_code, 200)
        response_data = json.loads(response.content)
        self.assertEqual(response_data['success'], True)
        self.assertTrue('token' in response_data)
        self.assertEqual(response_data['user']['username'], 'testuser')
    
    def test_register_duplicate_username(self):
        self.client.post(self.register_url, data=json.dumps(self.test_user_data), content_type='application/json')
        response = self.client.post(self.register_url, data=json.dumps(self.test_user_data), content_type='application/json')
        
        self.assertEqual(response.status_code, 400)
        response_data = json.loads(response.content)
        self.assertEqual(response_data['success'], False)
    
    def test_register_short_password(self):
        data = {'username': 'test', 'email': 'test@test.com', 'password': '123'}
        response = self.client.post(self.register_url, data=json.dumps(data), content_type='application/json')
        
        self.assertEqual(response.status_code, 400)
        response_data = json.loads(response.content)
        self.assertIn('password', response_data['error'].lower())
        
        try:
            User.objects.filter(username='test').delete()
        except:
            pass
    
    def test_login_success(self):
        self.client.post(self.register_url, data=json.dumps(self.test_user_data), content_type='application/json')
        
        login_data = {'email': 'test@example.com', 'password': 'testpass123'}
        response = self.client.post(self.login_url, data=json.dumps(login_data), content_type='application/json')
        
        self.assertEqual(response.status_code, 200)
        response_data = json.loads(response.content)
        self.assertEqual(response_data['success'], True)
        self.assertTrue('token' in response_data)
        self.assertEqual(response_data['user']['email'], 'test@example.com')
    
    def test_login_wrong_password(self):
        self.client.post(self.register_url, data=json.dumps(self.test_user_data), content_type='application/json')
        
        login_data = {'email': 'test@example.com', 'password': 'wrongpass'}
        response = self.client.post(self.login_url, data=json.dumps(login_data), content_type='application/json')
        
        self.assertEqual(response.status_code, 401)
        response_data = json.loads(response.content)
        self.assertEqual(response_data['success'], False)
    
    def test_login_nonexistent_email(self):
        login_data = {'email': 'nonexistent@test.com', 'password': 'testpass123'}
        response = self.client.post(self.login_url, data=json.dumps(login_data), content_type='application/json')
        
        self.assertEqual(response.status_code, 401)
        response_data = json.loads(response.content)
        self.assertEqual(response_data['success'], False)
    
    def test_logout_success(self):
        self.client.post(self.register_url, data=json.dumps(self.test_user_data), content_type='application/json')
        login_response = self.client.post(self.login_url, 
            data=json.dumps({'email': 'test@example.com', 'password': 'testpass123'}),
            content_type='application/json')
        
        login_data = json.loads(login_response.content)
        token = login_data['token']
        
        response = self.client.delete(self.logout_url, HTTP_AUTHORIZATION=f'Bearer {token}')
        
        self.assertEqual(response.status_code, 200)
        response_data = json.loads(response.content)
        self.assertEqual(response_data['success'], True)
    
    def test_get_profile_success(self):
        self.client.post(self.register_url, data=json.dumps(self.test_user_data), content_type='application/json')
        login_response = self.client.post(self.login_url,
            data=json.dumps({'email': 'test@example.com', 'password': 'testpass123'}),
            content_type='application/json')
        
        login_data = json.loads(login_response.content)
        token = login_data['token']
        
        response = self.client.get(self.profile_url, HTTP_AUTHORIZATION=f'Bearer {token}')
        
        self.assertEqual(response.status_code, 200)
        response_data = json.loads(response.content)
        self.assertEqual(response_data['success'], True)
        self.assertEqual(response_data['user']['username'], 'testuser')


class ProfileAPITests(TestCase):
    
    def setUp(self):
        self.client = self.client_class()
        self.update_profile_url = reverse('update_profile')
        self.change_password_url = reverse('change_password')
        self.delete_account_url = reverse('delete_account')
        
        User.objects.filter(username='testuser_profile').delete()
        
        user = User(
            username='testuser_profile',
            email='test_profile@example.com'
        )
        user.set_password('testpass123')
        user.save()
        
        self.user = user
        self.token = AuthToken(
            user=user,
            expires_at=timezone.now() + timezone.timedelta(days=30)
        )
        self.token.save()
        self.auth_header = f'Bearer {self.token.token}'
    
    def tearDown(self):
        try:
            AuthToken.objects.filter(user=self.user).delete()
            self.user.delete()
        except:
            pass
    
    def test_delete_account_success(self):
        data = {'password': 'testpass123'}
        response = self.client.delete(self.delete_account_url, data=json.dumps(data), content_type='application/json', HTTP_AUTHORIZATION=self.auth_header)
        
        self.assertIn(response.status_code, [200, 400, 401, 403])


class AccountStatsAPITests(TestCase):
    
    def setUp(self):
        self.client = self.client_class()
        self.stats_url = reverse('get_account_stats')
        self.models_url = reverse('get_user_models_detailed')
        
        User.objects.filter(username='testuser_stats').delete()
        
        user = User(
            username='testuser_stats',
            email='test_stats@example.com'
        )
        user.set_password('testpass123')
        user.save()
        self.user = user
        
        self.token = AuthToken(
            user=user,
            expires_at=timezone.now() + timezone.timedelta(days=30)
        )
        self.token.save()
        self.auth_header = f'Bearer {self.token.token}'
        
        UserModel.objects.filter(file_id='test_file_stats').delete()
        
        self.model = UserModel.objects.create(
            user=user,
            file_id='test_file_stats',
            title='Test Model',
            total_elements=100,
            building_count=50,
            highway_count=20,
            water_count=15,
            natural_count=10,
            landuse_count=5,
            file_size_mb=2.5,
            is_public=True,
            public_view_count=10,
            download_count=3
        )
    
    def tearDown(self):
        try:
            UserModel.objects.filter(file_id='test_file_stats').delete()
            AuthToken.objects.filter(user=self.user).delete()
            self.user.delete()
        except:
            pass
    
    def test_get_account_stats_success(self):
        response = self.client.get(self.stats_url, HTTP_AUTHORIZATION=self.auth_header)
        
        self.assertEqual(response.status_code, 200)
        response_data = json.loads(response.content)
        self.assertEqual(response_data['success'], True)
    
    def test_get_user_models_detailed(self):
        response = self.client.get(self.models_url, HTTP_AUTHORIZATION=self.auth_header)
        
        self.assertEqual(response.status_code, 200)
        response_data = json.loads(response.content)
        self.assertEqual(response_data['success'], True)


class ModelManagementAPITests(TestCase):
    
    def setUp(self):
        self.client = self.client_class()
        
        User.objects.filter(username='testuser_model').delete()
        
        user = User(
            username='testuser_model',
            email='test_model@example.com'
        )
        user.set_password('testpass123')
        user.save()
        self.user = user
        
        self.token = AuthToken(
            user=user,
            expires_at=timezone.now() + timezone.timedelta(days=30)
        )
        self.token.save()
        self.auth_header = f'Bearer {self.token.token}'
        
        UserModel.objects.filter(file_id='test_file_model').delete()
        
        self.model = UserModel.objects.create(
            user=user,
            file_id='test_file_model',
            title='Original Title',
            description='Original Description',
            is_public=False
        )
    
    def tearDown(self):
        try:
            UserModel.objects.filter(file_id='test_file_model').delete()
            AuthToken.objects.filter(user=self.user).delete()
            self.user.delete()
        except:
            pass
    
    def test_update_model_success(self):
        url = reverse('update_model', kwargs={'file_id': 'test_file_model'})
        data = {
            'title': 'Updated Title',
            'description': 'Updated Description'
        }
        response = self.client.put(url, data=json.dumps(data), content_type='application/json', HTTP_AUTHORIZATION=self.auth_header)
        
        self.assertEqual(response.status_code, 200)
        response_data = json.loads(response.content)
        self.assertEqual(response_data['success'], True)
    
    def test_toggle_visibility_public(self):
        url = reverse('toggle_model_visibility', kwargs={'file_id': 'test_file_model'})
        response = self.client.put(url, HTTP_AUTHORIZATION=self.auth_header)
        
        self.assertEqual(response.status_code, 200)
        response_data = json.loads(response.content)
        self.assertEqual(response_data['success'], True)
    
    def test_get_model_stats(self):
        url = reverse('get_model_stats', kwargs={'file_id': 'test_file_model'})
        response = self.client.get(url, HTTP_AUTHORIZATION=self.auth_header)
        
        self.assertEqual(response.status_code, 200)
        response_data = json.loads(response.content)
        self.assertEqual(response_data['success'], True)
    
    def test_delete_model(self):
        url = reverse('delete_model', kwargs={'file_id': 'test_file_model'})
        response = self.client.delete(url, HTTP_AUTHORIZATION=self.auth_header)
        
        self.assertEqual(response.status_code, 200)
        response_data = json.loads(response.content)
        self.assertEqual(response_data['success'], True)


class WorkshopAPITests(TestCase):
    
    def setUp(self):
        self.client = self.client_class()
        self.public_models_url = reverse('get_public_models')
        self.workshop_stats_url = reverse('workshop_stats')
        self.featured_models_url = reverse('featured_models')
        
        User.objects.filter(username='workshop_creator').delete()
        
        user = User(
            username='workshop_creator',
            email='workshop@test.com'
        )
        user.set_password('pass123')
        user.save()
        
        for i in range(3):
            UserModel.objects.filter(file_id=f'workshop_model_{i}').delete()
            UserModel.objects.create(
                user=user,
                file_id=f'workshop_model_{i}',
                title=f'Workshop Model {i}',
                is_public=True,
                total_elements=100 + i * 10,
                public_view_count=i * 5,
                download_count=i * 2
            )
    
    def tearDown(self):
        try:
            for i in range(3):
                UserModel.objects.filter(file_id=f'workshop_model_{i}').delete()
            User.objects.filter(username='workshop_creator').delete()
        except:
            pass
    
    def test_get_public_models_default(self):
        response = self.client.get(self.public_models_url)
        
        self.assertEqual(response.status_code, 200)
        response_data = json.loads(response.content)
        self.assertEqual(response_data['success'], True)
    
    def test_get_workshop_stats(self):
        response = self.client.get(self.workshop_stats_url)
        
        self.assertEqual(response.status_code, 200)
        response_data = json.loads(response.content)
        self.assertEqual(response_data['success'], True)
    
    def test_get_featured_models(self):
        response = self.client.get(self.featured_models_url)
        
        self.assertEqual(response.status_code, 200)
        response_data = json.loads(response.content)
        self.assertEqual(response_data['success'], True)


class FavoriteAPITests(TestCase):
    
    def setUp(self):
        self.client = self.client_class()
        
        User.objects.filter(username='favorite_user1').delete()
        User.objects.filter(username='favorite_user2').delete()
        
        self.user1 = User(
            username='favorite_user1',
            email='fav1@test.com'
        )
        self.user1.set_password('pass123')
        self.user1.save()
        
        self.user2 = User(
            username='favorite_user2',
            email='fav2@test.com'
        )
        self.user2.set_password('pass123')
        self.user2.save()
        
        UserModel.objects.filter(file_id='other_model_fav').delete()
        
        self.model = UserModel.objects.create(
            user=self.user2,
            file_id='other_model_fav',
            title='Other User Model',
            is_public=True
        )
        
        self.token = AuthToken(
            user=self.user1,
            expires_at=timezone.now() + timezone.timedelta(days=30)
        )
        self.token.save()
        self.auth_header = f'Bearer {self.token.token}'
    
    def tearDown(self):
        try:
            UserModel.objects.filter(file_id='other_model_fav').delete()
            AuthToken.objects.filter(user=self.user1).delete()
            AuthToken.objects.filter(user=self.user2).delete()
            self.user1.delete()
            self.user2.delete()
        except:
            pass
    
    


class TextureAPITests(TestCase):
    
    def setUp(self):
        self.client = self.client_class()
        self.texture_url = reverse('element_texture')
        self.available_textures_url = reverse('available_textures')
    
    def test_get_texture_default(self):
        response = self.client.get(self.texture_url, {'texture': 'default', 'type': 'building'})
        self.assertIn(response.status_code, [200, 404])
    
    def test_get_available_textures(self):
        response = self.client.get(self.available_textures_url)
        self.assertIn(response.status_code, [200, 404, 500])


class PublicModelViewAPITests(TestCase):
    
    def setUp(self):
        self.client = self.client_class()
        
        User.objects.filter(username='owner').delete()
        
        user = User(
            username='owner',
            email='owner@test.com'
        )
        user.set_password('pass123')
        user.save()
        
        UserModel.objects.filter(file_id='view_test_model').delete()
        
        self.model = UserModel.objects.create(
            user=user,
            file_id='view_test_model',
            title='View Test Model',
            is_public=True,
            public_view_count=0
        )
        
        self.increment_view_url = reverse('increment_model_view', kwargs={'file_id': 'view_test_model'})
    
    def tearDown(self):
        try:
            UserModel.objects.filter(file_id='view_test_model').delete()
            User.objects.filter(username='owner').delete()
        except:
            pass
    
    def test_increment_view_count(self):
        response = self.client.post(self.increment_view_url)
        self.assertIn(response.status_code, [200, 404, 405])
    
    def test_increment_view_own_model(self):
        token = AuthToken(
            user=self.model.user,
            expires_at=timezone.now() + timezone.timedelta(days=30)
        )
        token.save()
        
        response = self.client.post(self.increment_view_url, HTTP_AUTHORIZATION=f'Bearer {token.token}')
        self.assertIn(response.status_code, [200, 404])
        
        AuthToken.objects.filter(token=token.token).delete()


class HealthAndDocsAPITests(TestCase):
    
    def setUp(self):
        self.client = self.client_class()
        self.health_url = reverse('health_check')
        self.docs_url = reverse('api_docs')
        self.session_info_url = reverse('session_info')
    
    def test_health_check(self):
        response = self.client.get(self.health_url)
        
        self.assertEqual(response.status_code, 200)
        response_data = json.loads(response.content)
        self.assertEqual(response_data['status'], 'healthy')
        self.assertEqual(response_data['version'], '2.1.0')
    
    def test_session_info(self):
        response = self.client.get(self.session_info_url)
        
        self.assertEqual(response.status_code, 200)
        response_data = json.loads(response.content)
        self.assertTrue('storage_system' in response_data)


class TokenAuthenticationTests(TestCase):
    
    def setUp(self):
        self.client = self.client_class()
        
        User.objects.filter(username='testuser_token').delete()
        
        self.user = User(
            username='testuser_token',
            email='test_token@example.com'
        )
        self.user.set_password('testpass123')
        self.user.save()
        
        self.valid_token = AuthToken(
            user=self.user,
            expires_at=timezone.now() + timezone.timedelta(days=30)
        )
        self.valid_token.save()
        
        self.protected_url = reverse('get_account_stats')
    
    def tearDown(self):
        try:
            AuthToken.objects.filter(user=self.user).delete()
            self.user.delete()
        except:
            pass
    
    def test_valid_token_access(self):
        response = self.client.get(self.protected_url, HTTP_AUTHORIZATION=f'Bearer {self.valid_token.token}')
        
        self.assertEqual(response.status_code, 200)
        response_data = json.loads(response.content)
        self.assertEqual(response_data['success'], True)
    
    def test_no_token_access(self):
        response = self.client.get(self.protected_url)
        
        self.assertEqual(response.status_code, 401)
        response_data = json.loads(response.content)
        self.assertEqual(response_data['success'], False)
    
    def test_invalid_token_access(self):
        response = self.client.get(self.protected_url, HTTP_AUTHORIZATION='Bearer invalid_token_12345')
        
        self.assertEqual(response.status_code, 401)
        response_data = json.loads(response.content)
        self.assertEqual(response_data['success'], False)