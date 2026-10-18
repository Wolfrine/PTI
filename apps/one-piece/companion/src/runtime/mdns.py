"""Persistent household mDNS only. No credential, HTTP, DNS-port-53 or OS edits."""
import argparse
import json
import signal
import socket
import sys
import threading

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--config',required=True)
args=parser.parse_args()
with open(args.config,encoding='utf-8') as source:
    config=json.load(source)
assert config['mdns']['hostname']=='onepiece.local'
assert config['mdns']['address']=='192.168.68.105'
sys.path.insert(0,config['mdns']['toolsPath'])
from zeroconf import IPVersion,ServiceInfo,Zeroconf
stop=threading.Event()
def control_input():
    for line in sys.stdin:
        if line.strip()=='stop':
            stop.set()
            return
threading.Thread(target=control_input,daemon=True).start()
signal.signal(signal.SIGINT,lambda *_:stop.set())
signal.signal(signal.SIGTERM,lambda *_:stop.set())
service=ServiceInfo('_https._tcp.local.','PTI One Piece._https._tcp.local.',addresses=[socket.inet_aton(config['mdns']['address'])],port=8443,properties={'path':'/runtime-health'},server='onepiece.local.')
zeroconf=Zeroconf(interfaces=[config['mdns']['address']],ip_version=IPVersion.V4Only)
try:
    zeroconf.register_service(service)
    print(json.dumps({'event':'ready','hostname':'onepiece.local'}),flush=True)
    stop.wait()
finally:
    zeroconf.unregister_service(service)
    zeroconf.close()
