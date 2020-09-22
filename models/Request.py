class Request:
    def __init__(self, request):
        request_dec = request.decode('utf-8').split(' ')
        self.Method = request_dec[0]
        self.URL = request_dec[1]
        self.Protocol = request_dec[2].split('\r\n')[0]  # Split HTTP/1.1\r\nHost: by \r\n

    def __str__(self):
        return 'Protocol: {2}\nMethod: {0}\nURL: {1}\n'.format(self.Method, self.URL, self.Protocol)
