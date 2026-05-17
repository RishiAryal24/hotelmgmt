from django.core.exceptions import ImproperlyConfigured
from django.db import utils as db_utils
from django_tenants.postgresql_backend import base as tenant_base
from django_tenants.postgresql_backend.base import DatabaseWrapper as TenantDatabaseWrapper
from django_tenants.utils import get_limit_set_calls


class DatabaseWrapper(TenantDatabaseWrapper):
    def _cursor(self, name=None):
        """
        Keep django-tenants search_path handling compatible with Django debug SQL.

        With psycopg 3, Django's debug SQL formatter opens another cursor while
        logging SET search_path. That cursor also tries to set search_path, which
        recurses until Python raises RecursionError. Execute only this internal
        statement on the wrapped raw cursor so normal query logging still works.
        """
        if name:
            cursor = super(TenantDatabaseWrapper, self)._cursor(name=name)
        else:
            cursor = super(TenantDatabaseWrapper, self)._cursor()

        if (not get_limit_set_calls()) or not self.search_path_set_schemas:
            if not self.schema_name:
                raise ImproperlyConfigured(
                    "Database schema not set. Did you forget to call set_schema() or set_tenant()?"
                )

            search_paths = self._get_cursor_search_paths()

            if name:
                cursor_for_search_path = self.connection.cursor()
            else:
                cursor_for_search_path = cursor

            raw_cursor = getattr(cursor_for_search_path, "cursor", cursor_for_search_path)

            try:
                formatted_search_paths = ["'{}'".format(s) for s in search_paths]
                raw_cursor.execute("SET search_path = {0}".format(",".join(formatted_search_paths)))
            except (db_utils.DatabaseError, tenant_base.psycopg.InternalError):
                self.search_path_set_schemas = None
            else:
                self.search_path_set_schemas = search_paths
            if name:
                cursor_for_search_path.close()
        return cursor
