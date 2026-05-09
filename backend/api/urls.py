from django.urls import include, path
from drf_yasg.views import get_schema_view
from drf_yasg import openapi
from rest_framework import permissions

schema_view = get_schema_view(
    openapi.Info(
        title='Hotel Management ERP API',
        default_version='v1',
        description='API documentation for the multi-tenant hotel management and accounting ERP platform.',
        contact=openapi.Contact(email='support@hotelmgmt.example'),
    ),
    public=True,
    permission_classes=(permissions.AllowAny,),
)

urlpatterns = [
    path('tenants/', include('tenants.urls')),
    path('auth/', include('users.urls')),
    path('bookings/', include('bookings.urls')),
    path('housekeeping/', include('housekeeping.urls')),
    path('restaurant/', include('restaurant.urls')),
    path('accounting/', include('accounting.urls')),
    path('docs/', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui'),
    path('docs/redoc/', schema_view.with_ui('redoc', cache_timeout=0), name='schema-redoc'),
]
