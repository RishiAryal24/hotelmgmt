from django.urls import path

from tenants.views import CurrentTenantSettingsView, TenantListCreateView

urlpatterns = [
    path('settings/', CurrentTenantSettingsView.as_view(), name='tenant-settings'),
    path('', TenantListCreateView.as_view(), name='tenant-list-create'),
    path('create/', TenantListCreateView.as_view(), name='tenant-create'),
]
