Feature: ELMC 3D API

  Background:
    Given the API server is running at "http://127.0.0.1:8000"

  Scenario: Health check
    When I send a GET request to "/api/health/"
    Then the response status should be 200
    And the JSON response should contain "status" with value "healthy"

  Scenario: Fail registration with existing email
    When I send a POST request to "/api/auth/register/" with body:
      | username | another_user |
      | email    | test@example.com |
      | password | pass123 |
    Then the response status should be 400
    And the JSON response should contain "error" with message "The email address is already registered"

  Scenario: Login with valid credentials
    When I send a POST request to "/api/auth/login/" with body:
      | email    | test@example.com |
      | password | TestPass123 |
    Then the response status should be 200
    And the JSON response should contain a non-empty "token"
    And the JSON response should contain "user" with field "email" equals "test@example.com"

  Scenario: Login with wrong password
    When I send a POST request to "/api/auth/login/" with body:
      | email    | test@example.com |
      | password | wrongpass |
    Then the response status should be 401
    And the JSON response should contain "success" with value false

  Scenario: Get own profile with valid token
    Given I am authenticated as user "test@example.com" with password "TestPass123"
    When I send a GET request to "/api/users/me/"
    Then the response status should be 200
    And the JSON response should contain "user" with field "username" equals "testuser_abc"
    And the JSON response should contain "user" with field "models_count"

  Scenario: Get profile with invalid token (skip - requires special header setup)
    Skip

  Scenario: Logout
    Given I am authenticated as user "test@example.com" with password "TestPass123"
    When I send a DELETE request to "/api/auth/logout/"
    Then the response status should be 200
    And the JSON response should contain "success" with value true

  Scenario: Save building data (GeoJSON import)
    Given I am authenticated as user "test@example.com" with password "TestPass123"
    When I send a POST request to "/api/models/import/" with body:
      | file_id | test_import_123 |
      | dataType | building |
      | geojson | {"type":"FeatureCollection","features":[{"type":"Feature","properties":{"building":"yes"},"geometry":{"type":"Polygon","coordinates":[[[0,0],[0,1],[1,1],[1,0],[0,0]]]}}]} |
      | bounds | {"north":1,"south":0,"east":1,"west":0} |
      | origin | [0,0] |
    Then the response status should be 200
    And the JSON response should contain "success" with value true
    And the JSON response should contain a non-empty "file_id"
    And the JSON response should contain "building_count"

  Scenario: Get model info by file_id (JSON available)
    Given I am authenticated as user "test@example.com" with password "TestPass123"
    And a model exists with file_id "test_import_123" for current user
    When I send a GET request to "/api/models/test_import_123/"
    Then the response status should be 200
    And the JSON response should contain "file_type" with value "json"

  Scenario: Get user favorites list
    Given I am authenticated as user "test@example.com" with password "TestPass123"
    When I send a GET request to "/api/users/me/favorites/"
    Then the response status should be 200
    And the JSON response should contain "favorites" as an array
    And the JSON response should contain "total"

  Scenario: List public models with filtering and sorting
    When I send a GET request to "/api/models/?element_type=buildings&sort=views&per_page=1"
    Then the response status should be 200
    And the JSON response should contain "models" as an array
    And the JSON response should contain "pagination" with field "total_pages"

  Scenario: Get workshop statistics
    When I send a GET request to "/api/workshop-stats/"
    Then the response status should be 200
    And the JSON response should contain "stats" with field "total_models"
    And the JSON response should contain "stats" with field "total_creators"

  Scenario: Get list of available textures
    When I send a GET request to "/api/textures/"
    Then the response status should be 200
    And the JSON response should contain "success" with value true
    And the JSON response should contain "textures" as an array

  Scenario: Get a specific texture image
    When I send a GET request to "/api/textures/element/?texture=Concrete048_1K-JPG_Color&face=top&type=building"
    Then the response status should be 200
    And the response content type should be "image/jpeg"

  Scenario: Admin users list (requires admin user)
    Given I am authenticated as an admin user
    When I send a GET request to "/api/admin/users/?page=1&per_page=10"
    Then the response status should be 200
    And the JSON response should contain "users" as an array
    And the JSON response should contain "total"

  Scenario: Admin create user
    Given I am authenticated as an admin user
    When I send a POST request to "/api/admin/users/" with body:
      | username | admin_created |
      | email    | admin@test.com |
      | password | AdminPass123 |
      | is_admin | false |
    Then the response status should be 200
    And the JSON response should contain "success" with value true

  Scenario: Admin models list
    Given I am authenticated as an admin user
    When I send a GET request to "/api/admin/models/?page=1&per_page=10"
    Then the response status should be 200
    And the JSON response should contain "models" as an array
    And each model should have "has_glb_export" key

  Scenario: Connect to notification stream (SSE)
    Given I am authenticated as user "test@example.com" with password "TestPass123"
    When I open an EventSource connection to "/api/notifications/stream/?token={token}"
    Then I should receive a "connected" event within 5 seconds

