import requests
import json
import time
import os
import io
from behave import given, when, then
from requests_toolbelt.multipart.encoder import MultipartEncoder

BASE_URL = "http://127.0.0.1:8000"

def setup_test_users():
    admin_login = requests.post(f"{BASE_URL}/api/auth/login/", json={
        "email": "admin@example.com", "password": "AdminPass123"
    })
    if admin_login.status_code != 200:
        requests.post(f"{BASE_URL}/api/auth/register/", json={
            "username": "admin", "email": "admin@example.com", "password": "AdminPass123"
        })
        admin_login = requests.post(f"{BASE_URL}/api/auth/login/", json={
            "email": "admin@example.com", "password": "AdminPass123"
        })
    admin_token = admin_login.json()['token']
    admin_headers = {'Authorization': f'Bearer {admin_token}'}

    users = requests.get(f"{BASE_URL}/api/admin/users/?per_page=100", headers=admin_headers)
    if users.status_code == 200:
        for user in users.json().get('users', []):
            email = user.get('email', '')
            username = user.get('username', '')
            if email in ['test@example.com', 'test_updated@example.com'] or username in ['testuser_abc', 'testuser_updated', 'admin_created']:
                requests.delete(f"{BASE_URL}/api/admin/users/{user['id']}/", headers=admin_headers)
    
    reg = requests.post(f"{BASE_URL}/api/auth/register/", json={
        "username": "testuser_abc", "email": "test@example.com", "password": "TestPass123"
    })
    if reg.status_code != 200:
        print(f"Warning: Could not create test user: {reg.text}")

    check = requests.get(f"{BASE_URL}/api/models/public_model_123/", headers=admin_headers)
    if check.status_code == 404:
        geojson = {"type": "FeatureCollection", "features": []}
        create = requests.post(f"{BASE_URL}/api/models/import/", json={
            "file_id": "public_model_123", "geojson": geojson
        }, headers=admin_headers)
        if create.status_code == 200:
            requests.put(f"{BASE_URL}/api/models/public_model_123/visibility/", headers=admin_headers)
            dummy_glb = b'GLB dummy content'
            files = {'glb_file': ('dummy.glb', io.BytesIO(dummy_glb), 'model/gltf-binary')}
            requests.post(f"{BASE_URL}/api/models/export/", files=files, data={'file_id': 'public_model_123'}, headers=admin_headers)

setup_test_users()

def before_scenario(context, scenario):
    context.response = None
    context.request_data = {}
    context.headers = {}
    context.temp_data = {}
    context.event_source = None

def get_token(context):
    if not hasattr(context, 'temp_data'):
        context.temp_data = {}
    return context.temp_data.get('token', '')

def set_token(context, token):
    if not hasattr(context, 'temp_data'):
        context.temp_data = {}
    context.temp_data['token'] = token

def add_auth_header(context, headers=None):
    if headers is None:
        headers = {}
    token = get_token(context)
    if token:
        headers['Authorization'] = f'Bearer {token}'
    return headers

@given('the API server is running at "{url}"')
def step_api_running(context, url):
    global BASE_URL
    BASE_URL = url
    try:
        response = requests.get(f"{BASE_URL}/api/health/", timeout=5)
        assert response.status_code == 200
    except Exception as e:
        raise Exception(f"API server not reachable: {e}")

@given('I am authenticated as user "{email}" with password "{password}"')
def step_authenticate(context, email, password):
    response = requests.post(f"{BASE_URL}/api/auth/login/", json={
        "email": email,
        "password": password
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert 'token' in data
    set_token(context, data['token'])
    context.temp_data['user_email'] = email

@given('I am authenticated as an admin user')
def step_admin_authenticate(context):
    admin_email = "admin@example.com"
    admin_pass = "AdminPass123"
    resp = requests.post(f"{BASE_URL}/api/auth/login/", json={
        "email": admin_email, "password": admin_pass
    })
    if resp.status_code != 200:
        reg = requests.post(f"{BASE_URL}/api/auth/register/", json={
            "username": "admin", "email": admin_email, "password": admin_pass
        })
        assert reg.status_code == 200, "Could not create admin"
        resp = requests.post(f"{BASE_URL}/api/auth/login/", json={
            "email": admin_email, "password": admin_pass
        })
    assert resp.status_code == 200
    data = resp.json()
    set_token(context, data['token'])

@given('a model exists with file_id "{file_id}" for current user')
def step_model_exists(context, file_id):
    headers = add_auth_header(context)
    resp = requests.get(f"{BASE_URL}/api/models/{file_id}/", headers=headers)
    if resp.status_code == 404:
        geojson = {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {"building": "yes"},
                "geometry": {"type": "Polygon", "coordinates": [[[0,0],[0,1],[1,1],[1,0],[0,0]]]}
            }]
        }
        resp_create = requests.post(f"{BASE_URL}/api/models/import/", json={
            "file_id": file_id,
            "geojson": geojson,
            "dataType": "building"
        }, headers=headers)
        assert resp_create.status_code == 200, f"Could not create model: {resp_create.text}"
    requests.put(f"{BASE_URL}/api/models/{file_id}/visibility/", headers=headers)

@given('a public model exists with file_id "{file_id}"')
def step_public_model_exists(context, file_id):
    headers = add_auth_header(context)
    resp = requests.get(f"{BASE_URL}/api/models/{file_id}/", headers=headers)
    if resp.status_code == 404:
        geojson = {"type":"FeatureCollection","features":[]}
        requests.post(f"{BASE_URL}/api/models/import/", json={
            "file_id": file_id, "geojson": geojson
        }, headers=headers)
    requests.put(f"{BASE_URL}/api/models/{file_id}/visibility/", headers=headers)

@given('a GLB model exists with file_id from previous step')
def step_glb_model_exists(context):
    file_id = context.temp_data.get('last_export_file_id')
    assert file_id, "No previous export file_id found"
    resp = requests.head(f"{BASE_URL}/api/models/export/{file_id}/glb/",
                         headers=add_auth_header(context))
    assert resp.status_code == 200, f"GLB model not found: {file_id}"

@given('a GLB model exists with file_id')
def step_glb_model_exists_generic(context):
    file_id = context.temp_data.get('last_export_file_id', 'public_model_123')
    resp = requests.head(f"{BASE_URL}/api/models/export/{file_id}/glb/",
                         headers=add_auth_header(context))
    assert resp.status_code == 200, f"GLB model not found: {file_id}"

@when('I send a POST request to "{endpoint}" with body:')
def step_post_request_table(context, endpoint):
    data = {}
    first_key = context.table.headings[0].strip()
    first_value = context.table.headings[1].strip()
    if first_key.lower() not in ['key', 'field', 'câmp', 'camp']:
        data[first_key] = first_value
    for row in context.table:
        key = str(row[0]).strip()
        value = str(row[1]).strip()
        if key in ('geojson', 'bounds', 'origin'):
            try:
                value = json.loads(value)
            except:
                pass
        elif value.lower() == 'true':
            value = True
        elif value.lower() == 'false':
            value = False
        else:
            try:
                if '.' in value:
                    value = float(value)
                else:
                    value = int(value)
            except ValueError:
                pass
        data[key] = value
    context.request_data = data
    headers = {'Content-Type': 'application/json'}
    token = get_token(context)
    if token:
        headers['Authorization'] = f'Bearer {token}'
    context.response = requests.post(f"{BASE_URL}{endpoint}", json=data, headers=headers)

@when('I send a PUT request to "{endpoint}" with body:')
def step_put_request_table(context, endpoint):
    data = {}
    for row in context.table:
        data[row[0]] = row[1]
    context.request_data = data
    
    headers = {}
    token = get_token(context)
    if token:
        headers['Authorization'] = f'Bearer {token}'

    headers['Content-Type'] = 'application/json'
    context.response = requests.put(f"{BASE_URL}{endpoint}", json=data, headers=headers)

@when('I send a GET request to "{endpoint}"')
def step_get_request(context, endpoint):
    if ' with Authorization header ' in endpoint:
        parts = endpoint.split(' with Authorization header ')
        url_part = parts[0].strip()
        auth_part = parts[1].strip()
        if auth_part.startswith('Bearer '):
            token = auth_part.replace('Bearer ', '').strip()
            if token == '{token}':
                token = get_token(context)
            headers = {'Authorization': f'Bearer {token}'}
        else:
            headers = add_auth_header(context)
        endpoint = url_part
    else:
        headers = add_auth_header(context)
    
    if '{token}' in endpoint:
        endpoint = endpoint.replace('{token}', get_token(context))
    if '{file_id}' in endpoint and 'last_export_file_id' in context.temp_data:
        endpoint = endpoint.replace('{file_id}', context.temp_data['last_export_file_id'])
    
    context.response = requests.get(f"{BASE_URL}{endpoint}", headers=headers)

@when('I send a DELETE request to "{endpoint}"')
def step_delete_request(context, endpoint):
    if ' with Authorization header ' in endpoint:
        parts = endpoint.split(' with Authorization header ')
        url_part = parts[0].strip()
        auth_part = parts[1].strip()
        if auth_part.startswith('Bearer '):
            token = auth_part.replace('Bearer ', '').strip()
            if token == '{token}':
                token = get_token(context)
            headers = {'Authorization': f'Bearer {token}'}
        else:
            headers = add_auth_header(context)
        endpoint = url_part
    else:
        headers = add_auth_header(context)
    
    if '{token}' in endpoint:
        endpoint = endpoint.replace('{token}', get_token(context))
    if '{file_id}' in endpoint and 'last_export_file_id' in context.temp_data:
        endpoint = endpoint.replace('{file_id}', context.temp_data['last_export_file_id'])
    
    context.response = requests.delete(f"{BASE_URL}{endpoint}", headers=headers)

@when('I send a DELETE request to "{endpoint}" with body:')
def step_delete_request_with_body(context, endpoint):
    data = {}
    for row in context.table:
        data[row[0]] = row[1]
    headers = add_auth_header(context, {'Content-Type': 'application/json'})
    context.response = requests.delete(f"{BASE_URL}{endpoint}", json=data, headers=headers)

@when('I send a PUT request to "{endpoint}"')
def step_put_request_no_body(context, endpoint):
    headers = add_auth_header(context)
    context.response = requests.put(f"{BASE_URL}{endpoint}", headers=headers)

@when('I send a multipart POST request to "{endpoint}" with fields:')
def step_multipart_post(context, endpoint):
    fields = {}
    for row in context.table:
        field_name = row[0]
        field_value = row[1]
        if field_name == 'glb_file':
            dummy_content = b'GLB dummy content'
            fields[field_name] = ('test.glb', io.BytesIO(dummy_content), 'model/gltf-binary')
        else:
            fields[field_name] = field_value
    multipart_data = MultipartEncoder(fields=fields)
    headers = add_auth_header(context, {'Content-Type': multipart_data.content_type})
    context.response = requests.post(f"{BASE_URL}{endpoint}", data=multipart_data, headers=headers)
    if context.response.status_code == 200:
        data = context.response.json()
        if data.get('success') and 'file_id' in data:
            context.temp_data['last_export_file_id'] = data['file_id']

@when('I send a POST request to "{endpoint}"')
def step_post_request_no_body(context, endpoint):
    if ' with Authorization header ' in endpoint:
        parts = endpoint.split(' with Authorization header ')
        url_part = parts[0].strip()
        auth_part = parts[1].strip()
        if auth_part.startswith('Bearer '):
            token = auth_part.replace('Bearer ', '').strip()
            if token == '{token}':
                token = get_token(context)
            headers = {'Authorization': f'Bearer {token}'}
        else:
            headers = add_auth_header(context)
        endpoint = url_part
    else:
        headers = add_auth_header(context)
    
    if '{token}' in endpoint:
        endpoint = endpoint.replace('{token}', get_token(context))
    if '{file_id}' in endpoint and 'last_export_file_id' in context.temp_data:
        endpoint = endpoint.replace('{file_id}', context.temp_data['last_export_file_id'])
    
    context.response = requests.post(f"{BASE_URL}{endpoint}", headers=headers)

@when('I open an EventSource connection to "{url}"')
def step_open_sse(context, url):
    import sseclient
    token = get_token(context)
    url = url.replace('{token}', token)
    full_url = f"{BASE_URL}{url}"
    response = requests.get(full_url, stream=True, headers=add_auth_header(context))
    context.event_source = response
    client = sseclient.SSEClient(response)
    events = []
    for event in client.events():
        events.append(event)
        if event.event == 'connected':
            break
    context.temp_data['sse_events'] = events

@then('the response status should be {status_code:d}')
def step_check_status(context, status_code):
    assert context.response.status_code == status_code, \
        f"Expected {status_code}, got {context.response.status_code}. Body: {context.response.text[:200]}"

@then('the JSON response should contain "{key}" with value {value}')
def step_json_contains_key_value(context, key, value):
    data = context.response.json()
    assert key in data, f"Key '{key}' not found in {list(data.keys())}"
    if value.lower() == 'true':
        assert data[key] is True or data[key] == True
    elif value.lower() == 'false':
        assert data[key] is False or data[key] == False
    elif value.startswith('"') and value.endswith('"'):
        expected = value[1:-1]
        assert str(data[key]) == expected
    else:
        assert str(data[key]) == value

@then('the JSON response should contain a non-empty "{key}"')
def step_json_contains_non_empty(context, key):
    data = context.response.json()
    assert key in data
    assert data[key] is not None
    assert len(str(data[key])) > 0

@then('the JSON response should contain "user" with field "{field}" equals "{value}"')
def step_json_user_field_equals(context, field, value):
    data = context.response.json()
    assert 'user' in data
    assert data['user'].get(field) == value

@then('the message should be "{message}"')
def step_message_equals(context, message):
    data = context.response.json()
    assert data.get('message') == message

@then('the JSON response should contain "models" as an array')
def step_models_as_array(context):
    data = context.response.json()
    assert 'models' in data
    assert isinstance(data['models'], list)

@then('the JSON response should contain "models" as an array with maximum {max_count:d} items')
def step_models_max_items(context, max_count):
    data = context.response.json()
    assert 'models' in data
    assert isinstance(data['models'], list)
    assert len(data['models']) <= max_count

@then('the JSON response should contain "pagination" with field "{field}"')
def step_pagination_has_field(context, field):
    data = context.response.json()
    assert 'pagination' in data
    assert field in data['pagination']

@then('the JSON response should contain "stats" with field "{field}"')
def step_stats_has_field(context, field):
    data = context.response.json()
    assert 'stats' in data
    assert field in data['stats']

@then('the response content type should be "{content_type}"')
def step_content_type(context, content_type):
    actual = context.response.headers.get('Content-Type', '')
    assert actual.startswith(content_type), f"Expected {content_type}, got {actual}"

@then('the JSON response should contain "error" with message "{message}"')
def step_error_message(context, message):
    data = context.response.json()
    assert 'error' in data
    assert data['error'] == message

@then('the JSON response should contain "views" as a number')
def step_views_as_number(context):
    data = context.response.json()
    assert 'views' in data
    assert isinstance(data['views'], (int, float))

@then('at least one model in "models" should have "{field}" containing "{value}"')
def step_model_contains_text(context, field, value):
    data = context.response.json()
    models = data.get('models', [])
    found = any(value.lower() in str(m.get(field, '')).lower() for m in models)
    assert found, f"No model with {field} containing '{value}'"

@then('the model title should be "{title}"')
def step_model_title_equals(context, title):
    data = context.response.json()
    if 'model' in data and 'title' in data['model']:
        assert data['model']['title'] == title
    else:
        file_id = context.request_data.get('file_id')
        if not file_id:
            file_id = context.temp_data.get('last_export_file_id')
        resp = requests.get(f"{BASE_URL}/api/models/{file_id}/", headers=add_auth_header(context))
        assert resp.status_code == 200
        model_data = resp.json()
        assert model_data.get('title') == title

@then('each model should have "{key}" key')
def step_each_model_has_key(context, key):
    data = context.response.json()
    models = data.get('models', [])
    for m in models:
        assert key in m, f"Model {m.get('file_id')} missing key {key}"

@then('I should receive a "{event_type}" event within {seconds:d} seconds')
def step_sse_event_received(context, event_type, seconds):
    events = context.temp_data.get('sse_events', [])
    found = any(e.event == event_type for e in events)
    assert found, f"No {event_type} event received in {seconds}s"

# Pași suplimentari
@then(u'the JSON response should contain "user" with field "models_count"')
def step_user_has_models_count(context):
    data = context.response.json()
    assert 'user' in data
    assert 'models_count' in data['user']

@then(u'the JSON response should contain "total"')
def step_response_has_total(context):
    data = context.response.json()
    assert 'total' in data

@then(u'the JSON response should contain "building_count"')
def step_response_has_building_count(context):
    data = context.response.json()
    assert 'building_count' in data

@then(u'the JSON response should contain "favorites_count"')
def step_response_has_favorites_count(context):
    data = context.response.json()
    assert 'favorites_count' in data

@then(u'the JSON response should contain "favorites" as an array')
def step_response_favorites_array(context):
    data = context.response.json()
    assert 'favorites' in data
    assert isinstance(data['favorites'], list)

@then(u'the JSON response should contain "textures" as an array')
def step_response_textures_array(context):
    data = context.response.json()
    assert 'textures' in data
    assert isinstance(data['textures'], list)

@then(u'the JSON response should contain "users" as an array')
def step_response_users_array(context):
    data = context.response.json()
    assert 'users' in data
    assert isinstance(data['users'], list)