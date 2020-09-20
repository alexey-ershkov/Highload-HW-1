import datetime
from time import mktime
from wsgiref.handlers import format_date_time


def set_raw_code_status(method, code):
    if method != 'GET' and method != 'HEAD':
        return '405 Method not allowed'
    if code == 404:
        return '404 Not found'
    if code == 200:
        return '200 OK'
    return '403 Forbidden'


class Response:
    def __init__(self, protocol, method, status, content_type=None, body=None):
        self.Protocol = protocol
        self.Status = status
        self.ReqMethod = method
        self.Server = 'alersh'
        self.Date = format_date_time(mktime(datetime.datetime.now().timetuple()))

        if protocol == 'HTTP/1.1':
            self.Connection = 'keep-alive'
        else:
            self.Connection = 'close'

        if content_type:
            self.ContentType = content_type
            self.ContentLength = 0  # count
            self.Body = body

    def __str__(self):
        return 'Status: {0}\n' \
               'Date: {1}\n' \
               'Connection: {2}' \
            .format(self.Status,
                    self.Date,
                    self.Connection,
                    )

    def get_raw_headers(self):
        raw_headers = '{0} {1}\r\n' \
                      'Connection: {2}\r\n' \
                      'Date: {3}\r\n' \
                      'Server: {4}\r\n' \
            .format(self.Protocol,
                    set_raw_code_status(self.ReqMethod, self.Status),
                    self.Connection,
                    self.Date,
                    self.Server,
                    )
        return raw_headers.encode()
