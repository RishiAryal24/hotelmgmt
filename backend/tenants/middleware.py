class TenantHeaderMiddleware:
    """
    Allow local/API clients to select a tenant domain without changing the browser host.

    This keeps Super Admin flows on 127.0.0.1 while tenant-scoped module calls can
    route through django-tenants using X-Tenant-Domain.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        tenant_domain = request.headers.get('X-Tenant-Domain')
        if tenant_domain:
            request.META['HTTP_HOST'] = tenant_domain
            request.META['SERVER_NAME'] = tenant_domain.split(':')[0]
        return self.get_response(request)
