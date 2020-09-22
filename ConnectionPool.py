import logging
import multiprocessing
import os
from multiprocessing import Manager, Process
from multiprocessing.pool import ThreadPool

from handlers import handle_request


class ConnectionPool:
    def __init__(self, server, root_dir):
        self._manager = Manager()
        self._connections = self._manager.Queue()
        self._root_dir = root_dir
        for i in range(multiprocessing.cpu_count()):
            p = Process(target=self.process_init)
            p.start()
            logging.debug("Process with pid {}".format(p.pid))
        logging.info("Server Start")
        server.start(self._connections)

    def process_init(self):
        logger = logging.getLogger("process-{}".format(os.getpid()))
        thread_pool = ThreadPool()
        try:
            while True:
                try:
                    (connection, address) = self._connections.get()
                    thread_pool.apply_async(handle_request, (connection, address, logger, self._root_dir),
                                            callback=None)
                except:
                    pass
        except KeyboardInterrupt:
            thread_pool.close()
            thread_pool.join()
