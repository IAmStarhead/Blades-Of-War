#!/usr/bin/env python3
"""Serve the trial with single-byte-range support for seeking MP4s in a preview.

The archive remains completely standalone and does not require this server.
"""
from __future__ import annotations

import argparse
import email.utils
import os
import re
import shutil
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT = ROOT / 'work/male-gait-recovery'


class RangeHandler(SimpleHTTPRequestHandler):
    _remaining: int | None = None

    def end_headers(self) -> None:
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def send_head(self):
        self._remaining = None
        requested = self.headers.get('Range')
        # Ignore malformed and multi-range requests and let the normal static
        # handler return the full resource, as permitted by HTTP.
        match = re.fullmatch(r'bytes=(\d{0,20})-(\d{0,20})', requested or '')
        filename = self.translate_path(self.path)
        if not match or not os.path.isfile(filename):
            return super().send_head()
        first, last = match.groups()
        if not first and not last:
            return super().send_head()
        try:
            stream = open(filename, 'rb')
        except OSError:
            return super().send_head()
        try:
            stat = os.fstat(stream.fileno())
            # Without an ETag, a non-matching If-Range must receive the full
            # representation rather than a fragment of a changed resource.
            if_range = self.headers.get('If-Range')
            if if_range:
                try:
                    timestamp = email.utils.parsedate_to_datetime(if_range).timestamp()
                except (TypeError, ValueError, OverflowError):
                    timestamp = None
                if timestamp is None or int(timestamp) != int(stat.st_mtime):
                    stream.close()
                    return super().send_head()
            size = stat.st_size
            if first:
                start = int(first)
                end = min(int(last) if last else size - 1, size - 1)
            else:
                suffix = int(last)
                start, end = max(0, size - suffix), size - 1
            if start >= size or start > end:
                stream.close()
                self.send_response(416, 'Requested Range Not Satisfiable')
                self.send_header('Content-Range', f'bytes */{size}')
                self.send_header('Content-Length', '0')
                self.end_headers()
                return None
            self.send_response(206, 'Partial Content')
            self.send_header('Content-Type', self.guess_type(filename))
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
            self.send_header('Content-Length', str(end - start + 1))
            self.send_header('Last-Modified', self.date_time_string(stat.st_mtime))
            self.end_headers()
            stream.seek(start)
            self._remaining = end - start + 1
            return stream
        except BaseException:
            stream.close()
            raise

    def copyfile(self, source, outputfile) -> None:
        if self._remaining is None:
            shutil.copyfileobj(source, outputfile)
            return
        remaining = self._remaining
        while remaining:
            data = source.read(min(64 * 1024, remaining))
            if not data:
                break
            outputfile.write(data)
            remaining -= len(data)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, default=DEFAULT)
    parser.add_argument('--bind', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=4351)
    args = parser.parse_args()
    handler = partial(RangeHandler, directory=str(args.directory.resolve()))
    with ThreadingHTTPServer((args.bind, args.port), handler) as server:
        print(f'Serving {args.directory.resolve()} on {args.bind}:{args.port}', flush=True)
        server.serve_forever()


if __name__ == '__main__':
    main()
