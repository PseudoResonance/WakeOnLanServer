#!/usr/bin/env python3

import argparse
import asyncio, websockets
import json
from pathlib import Path
import os, subprocess

debug = False

class Config:
    def __init__(self):
        self.readConfig()
    
    def readConfig(self):
        configPath = "./config.json"
        config = Path(configPath).read_text()
        configJson = json.loads(config)
        self.devices = configJson['devices']
        self.settings = configJson['settings']
        self.maxPings = self.settings['max_pings']
        self.delayBetweenPings = self.settings['delay_between_pings']

class Status:
    def __init__(self):
        self.config = Config()
        self.devices = {}
        self.checkingDevices = {}
        for device in self.config.devices:
            self.devices[device['name']] = -1
            asyncio.ensure_future(self.checkStatus(device))
    
    def getDevice(self, name):
        for device in self.config.devices:
            if device['name'] == name:
                return device
        return None
    
    def currentStatus(self):
        ret = "["
        for name, status in self.devices.items():
            ret += "{\"name\":\"" + name + "\",\"status\":" + str(status) + "},"
        ret = ret.rstrip(ret[-1]) + "]"
        if len(ret) > 1:
            return "{\"type\":0,\"data\":" + ret + "}"
        else:
            return "{\"type\":0,\"data\":[]}"
    
    async def checkStatus(self, device):
        if device['name'] in self.checkingDevices:
            if debug:
                print("Cancelling old checking status for " + device['name'])
            self.checkingDevices[device['name']].cancel()
            del self.checkingDevices[device['name']]
        if debug:
            print("Beginning status check for " + device['name'])
        task = asyncio.ensure_future(self.checkStatusInternal(device))
        self.checkingDevices[device['name']] = task
        await task
        del self.checkingDevices[device['name']]
    
    async def checkStatusInternal(self, device):
        tryCount = 1
        while tryCount <= self.config.maxPings:
            if debug:
                print("Pinging " + device['name'] + " at " + device['ip'])
            process = await asyncio.create_subprocess_shell("ping -c 1 " + device['ip'], stdout=subprocess.DEVNULL)
            returnCode = await process.wait()
            if debug:
                print("Device " + device['name'] + " returned " + str(returnCode) + " on attempt " + str(tryCount))
            if returnCode == 0:
                self.devices[device['name']] = 1
                return
            else:
                await asyncio.sleep(self.config.delayBetweenPings)
            tryCount += 1
        self.devices[device['name']] = 0

status = Status()
connections = set()

@asyncio.coroutine
async def connect(websocket, path):
    connections.add(websocket)
    if debug:
        print("Connection opened")
        print(status.currentStatus())
    await websocket.send(status.currentStatus())
    try:
        async for message in websocket:
            try:
                msgJson = json.loads(message)
                if msgJson['command'] == 1:
                    device = status.getDevice(msgJson['name'])
                    if device is not None:
                        await websocket.send("{\"type\":1,\"data\":\"" + device['name'] + "\"}")
                        os.system("wakeonlan " + device['mac'])
                        status.devices[device['name']] = 2
                        asyncio.ensure_future(status.checkStatus(device))
            except json.JSONDecodeError:
                pass
    except websockets.exceptions.ConnectionClosedError:
        pass
    connections.remove(websocket)
    if debug:
        print("Connection closed")

@asyncio.coroutine
def scheduleUpdates():
    while True:
        yield from asyncio.sleep(5)
        msg = status.currentStatus()
        if debug:
            print("Updating all connections")
            print(msg)
        for connection in connections:
            yield from connection.send(msg)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('-d', '--debug', action='store_true')
    args = parser.parse_args()
    global debug
    debug = args.debug
    if debug:
        print("Debug output enabled")
    asyncio.get_event_loop().run_until_complete(websockets.serve(connect, "localhost", 8080))
    asyncio.ensure_future(scheduleUpdates())
    asyncio.get_event_loop().run_forever()

if __name__ == '__main__':
    main()