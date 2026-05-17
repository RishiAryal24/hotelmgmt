"""
URL configuration for hotelmgmt project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.contrib.staticfiles.views import serve as serve_static
from django.http import JsonResponse
from django.shortcuts import redirect
from django.urls import include, path, re_path


def health_check(_request):
    return JsonResponse({'status': 'ok'})


urlpatterns = [
    path('', lambda request: redirect('/api/v1/docs/')),
    path('healthz', health_check),
    path('healthz/', health_check),
    path('admin/', admin.site.urls),
    path('api/v1/', include('api.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

if settings.SERVE_LOCAL_STATIC:
    urlpatterns += [
        re_path(r'^static/(?P<path>.*)$', serve_static, {'insecure': True}),
    ]
