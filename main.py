import models
from Server import Server

HOST = 'localhost'
PORT = 3000


def run():
    server = Server(HOST, PORT)

    while True:
        req = models.Request(server.get_request())
        print(req)
        resp = models.Response(req.Protocol, req.Method, 200)
        print(resp)
        server.send_response(resp)
        server.close_conn()


if __name__ == '__main__':
    run()
