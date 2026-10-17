"""TLS context that works on every Python install.

The python.org macOS installer ships an OpenSSL with no CA bundle until "Install Certificates.command"
is run, so plain urlopen() fails with CERTIFICATE_VERIFY_FAILED. Use, in order: $SSL_CERT_FILE, certifi
(if installed), the OS bundle, then Python's defaults. Verification is never disabled.
"""
import os
import ssl

_CANDIDATES = (
    "/etc/ssl/cert.pem",                    # macOS, Alpine
    "/etc/ssl/certs/ca-certificates.crt",   # Debian/Ubuntu
    "/etc/pki/tls/certs/ca-bundle.crt",     # Fedora/RHEL
    "/opt/homebrew/etc/openssl@3/cert.pem",
)
_ctx = None


def ssl_context() -> ssl.SSLContext:
    global _ctx
    if _ctx is not None:
        return _ctx
    cafile = os.environ.get("SSL_CERT_FILE") or None
    if not cafile:
        try:
            import certifi  # optional
            cafile = certifi.where()
        except ImportError:
            paths = ssl.get_default_verify_paths()
            if not (paths.cafile or (paths.capath and os.path.isdir(paths.capath) and os.listdir(paths.capath))):
                cafile = next((p for p in _CANDIDATES if os.path.exists(p)), None)
    _ctx = ssl.create_default_context(cafile=cafile)
    return _ctx
