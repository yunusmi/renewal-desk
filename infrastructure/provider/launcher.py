#!/usr/bin/env python3
"""Container launcher for the ORIGINAL provider simulator.

The original file (references/company/provider_simulator.py) is copied into the
image unchanged. This launcher only imports its Handler and binds 0.0.0.0 inside
the isolated Docker network, because the original binds 127.0.0.1. Protocol and
in-memory state are exactly those of the original module.
"""

import os
import signal
import sys
from http.server import ThreadingHTTPServer

import provider_simulator

HOST = os.environ.get('PROVIDER_BIND_HOST', '0.0.0.0')
PORT = int(os.environ.get('PROVIDER_PORT', str(provider_simulator.PORT)))


def main():
    server = ThreadingHTTPServer((HOST, PORT), provider_simulator.Handler)
    server.daemon_threads = True

    def stop(_signum, _frame):
        # shutdown() must run outside serve_forever's thread; raise to unwind.
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop)
    print(f'provider simulator (original Handler) listening on {HOST}:{PORT}; in-memory state', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
