#!/bin/sh
# Optional system Chrome fallback only. Some macOS Chrome helpers inherit stderr
# beyond browser exit, keeping Node's child 'close' event pending indefinitely.
# Leave the browser's protocol pipes intact; disconnect only diagnostic stderr.
exec "${PLAYWRIGHT_EXECUTABLE_PATH:?System Chrome path required}" "$@" 2>/dev/null
