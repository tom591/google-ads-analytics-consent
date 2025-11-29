from flask import Flask, render_template, request, session, make_response
from datetime import timedelta
from secrets import token_urlsafe
import json

app = Flask(__name__)

# ---------------------------------------------------------------------
#  STABLE SESSION – ONE CSRF TOKEN FOR THE ENTIRE DURATION
# ---------------------------------------------------------------------

app.config.update(
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=False,      # True, if HTTPS
    SESSION_REFRESH_EACH_REQUEST=False,      # Keeps session lifetime stable; prevents auto-refresh on each request
    PERMANENT_SESSION_LIFETIME=timedelta(days=30)
)

app.config['SECRET_KEY'] = '259dfg4a7gg3'

# ---------------------------------------------------------------------
#  CSRF PROTECTION
# ---------------------------------------------------------------------

def generate_csrf_token():
    if '_csrf_token' not in session:
        session['_csrf_token'] = token_urlsafe(32)
    return session['_csrf_token']

app.jinja_env.globals['csrf_token'] = generate_csrf_token

@app.context_processor
def inject_consent_flag():
    return {'has_consent': bool(request.cookies.get('user_consent'))}

CSRF_EXEMPT = set()

@app.before_request
def csrf_protect():
    if request.method != 'POST':
        return
    if request.path in CSRF_EXEMPT:
        return
    incoming = (
        request.headers.get('X-CSRFToken')
        or (request.get_json(silent=True) or {}).get('_csrf_token')
        or request.form.get('_csrf_token')
    )
    if not incoming or incoming != session.get('_csrf_token'):
        app.logger.warning("[CSRF FAIL] session_token=%s incoming=%s",
                           session.get('_csrf_token'), incoming)
        return ("Forbidden", 403)

# ---------------------------------------------------------------------
#  ROUTES (index)
# ---------------------------------------------------------------------

@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')

# ---------------------------------------------------------------------
#  SET CONSENT GOOGLE COOKIES
# ---------------------------------------------------------------------

@app.route('/set-consent', methods=['POST'])
def set_consent():
    data = request.get_json(silent=True) or {}
    cookie_value = json.dumps({
        'analytics': bool(data.get('analytics')),
        'ads': bool(data.get('ads')),
        'personalize': bool(data.get('personalize'))
    }, separators=(',', ':'))

    resp = make_response(('', 204))
    resp.set_cookie(
        'user_consent',
        cookie_value,
        max_age=60*60*24*365,  # one year
        path='/',
        secure=False,          # True, if HTTPS
        httponly=False,        # False, because it must be readable from JS
        samesite='Lax',
    )
    return resp

# ---------------------------------------------------------------------
#  MAIN
# ---------------------------------------------------------------------

if __name__ == '__main__':
    app.run(debug=True)