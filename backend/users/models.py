import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils.translation import gettext_lazy as _

from core.models import UUIDModel
from tenants.models import Tenant


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('The email field must be set')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        return self.create_user(email, password, **extra_fields)


class Permission(UUIDModel):
    name = models.CharField(max_length=128)
    code = models.CharField(max_length=128, unique=True)
    module = models.CharField(max_length=64, blank=True)
    description = models.TextField(blank=True)

    class Meta:
        verbose_name = _('Permission')
        verbose_name_plural = _('Permissions')

    def __str__(self):
        return self.name


class Role(UUIDModel):
    name = models.CharField(max_length=128)
    code = models.CharField(max_length=128, default='custom')
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='roles', null=True, blank=True)
    description = models.TextField(blank=True)
    is_system = models.BooleanField(default=False)
    permissions = models.ManyToManyField(Permission, related_name='roles', blank=True)

    class Meta:
        verbose_name = _('Role')
        verbose_name_plural = _('Roles')
        unique_together = ('tenant', 'code')

    def __str__(self):
        return self.name


class PlatformUser(AbstractBaseUser, PermissionsMixin, UUIDModel):
    email = models.EmailField(_('email address'), unique=True, db_index=True)
    full_name = models.CharField(_('full name'), max_length=255, blank=True)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, null=True, blank=True)
    roles = models.ManyToManyField(Role, related_name='users', blank=True)
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_platform_admin = models.BooleanField(default=False)
    is_tenant_admin = models.BooleanField(default=False)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        verbose_name = _('Platform User')
        verbose_name_plural = _('Platform Users')

    def __str__(self):
        return self.email
