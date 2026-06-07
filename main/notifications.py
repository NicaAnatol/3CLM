import threading
import queue
from collections import defaultdict
import time
class NotificationManager:
    def __init__(self):
        self._queues = defaultdict(queue.Queue)
        self._lock = threading.Lock()

    def add_notification(self, user_id, message, level='info'):
        """Adaugă o notificare pentru utilizatorul dat."""
        with self._lock:
            self._queues[user_id].put({
                'type': 'notification',
                'level': level,
                'message': message,
                'timestamp': time.time()
            })

    def get_notifications(self, user_id, timeout=0.1):
        """Returnează toate notificările disponibile pentru utilizator."""
        q = self._queues.get(user_id)
        if not q:
            return []
        notifications = []
        try:
            while True:
                notifications.append(q.get_nowait())
        except queue.Empty:
            pass
        return notifications

    def has_notifications(self, user_id):
        q = self._queues.get(user_id)
        return q is not None and not q.empty()

    def remove_user(self, user_id):
        with self._lock:
            if user_id in self._queues:
                del self._queues[user_id]

# Instanță globală
notification_manager = NotificationManager()