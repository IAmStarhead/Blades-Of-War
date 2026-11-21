#!/usr/bin/env python3
"""Verify preview HTTP byte ranges and the 200/206/416 fallback semantics."""
from __future__ import annotations

import sys
sys.dont_write_bytecode = True
import tempfile
import threading
import urllib.error
import urllib.request
from functools import partial
from pathlib import Path
from http.server import ThreadingHTTPServer
from preview import RangeHandler


def request(url: str, headers: dict[str, str] | None = None, method: str = 'GET'):
    req = urllib.request.Request(url, headers=headers or {}, method=method)
    try:
        result = urllib.request.urlopen(req, timeout=5)
    except urllib.error.HTTPError as error:
        result = error
    with result:
        return result.status, result.headers, result.read()


def main() -> None:
    data = bytes(range(256))
    with tempfile.TemporaryDirectory(prefix='bow-preview-test-') as tmp:
        Path(tmp, 'clip.mp4').write_bytes(data)
        handler = partial(RangeHandler, directory=tmp)
        with ThreadingHTTPServer(('0.0.0.0', 0), handler) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                url = f'http://127.0.0.1:{server.server_port}/clip.mp4'
                status, headers, body = request(url, {'Host': 'preview.example'})
                assert (status, body, headers['Accept-Ranges']) == (200, data, 'bytes')
                modified = headers['Last-Modified']
                for value, expected, interval in [
                    ('bytes=10-19', data[10:20], 'bytes 10-19/256'),
                    ('bytes=250-', data[250:], 'bytes 250-255/256'),
                    ('bytes=-5', data[-5:], 'bytes 251-255/256'),
                    ('bytes=0-999', data, 'bytes 0-255/256'),
                ]:
                    status, headers, body = request(url, {'Range': value})
                    assert (status, body, headers['Content-Range']) == (206, expected, interval)
                    assert int(headers['Content-Length']) == len(expected)
                status, headers, body = request(url, {'Range': 'bytes=300-'})
                assert (status, body, headers['Content-Range']) == (416, b'', 'bytes */256')
                status, headers, body = request(url, {'Range': 'bytes=1-2'}, method='HEAD')
                assert (status, body, headers['Content-Length']) == (206, b'', '2')
                status, _, body = request(url, {'Range': 'bytes=1-2', 'If-Range': modified})
                assert (status, body) == (206, data[1:3])
                for extra in [{'If-Range': '"unknown-etag"'}, {'If-Range': 'Thu, 01 Jan 1970 00:00:00 GMT'}]:
                    status, _, body = request(url, {'Range': 'bytes=1-2', **extra})
                    assert (status, body) == (200, data)
                for value in ['bytes=1-2,4-5', 'invalid', 'bytes=' + '9' * 5000 + '-']:
                    status, _, body = request(url, {'Range': value})
                    assert (status, body) == (200, data)
            finally:
                server.shutdown()
                thread.join()
    print('PASS: full, explicit, suffix and open ranges; HEAD, 416, If-Range and invalid/multi-range fallbacks.')


if __name__ == '__main__':
    main()
