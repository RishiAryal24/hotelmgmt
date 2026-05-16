from rest_framework.routers import DefaultRouter

from hrms.views import AttendanceViewSet, EmployeeViewSet, PayrollPeriodViewSet, PayrollRunViewSet, ShiftViewSet

router = DefaultRouter()
router.register(r'employees', EmployeeViewSet)
router.register(r'shifts', ShiftViewSet)
router.register(r'attendance', AttendanceViewSet)
router.register(r'payroll-periods', PayrollPeriodViewSet)
router.register(r'payroll-runs', PayrollRunViewSet)

urlpatterns = router.urls
