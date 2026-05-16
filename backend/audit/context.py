from threading import local


_state = local()


def set_current_request(request):
    _state.request = request


def clear_current_request():
    if hasattr(_state, 'request'):
        del _state.request


def get_current_request():
    return getattr(_state, 'request', None)


def get_current_user():
    request = get_current_request()
    user = getattr(request, 'user', None)
    if user and user.is_authenticated:
        return user
    return None

