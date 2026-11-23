import fs from 'node:fs';
import {pending,decide} from './receipts.mjs';

if(process.argv[2] !== 'chrome-extension://njjcfpeiadgkanlcmifkjcifihccfigo/') process.exit(2);
function receive(bytes) {
  const message=JSON.parse(bytes.toString('utf8'));
  if(message.action==='list') return {requests:pending()};
  if(message.action==='share' || message.action==='decline') return decide(message);
  throw Error('Unknown popup operation.');
}
function reply(value) {
  const body=Buffer.from(JSON.stringify(value));
  const size=Buffer.alloc(4);
  size.writeUInt32LE(body.length);
  fs.writeSync(1,size);
  let sent=0;
  while(sent<body.length) sent+=fs.writeSync(1,body,sent,body.length-sent);
}
let buffer=Buffer.alloc(0);
for await(const chunk of process.stdin){
  buffer=Buffer.concat([buffer,chunk]);
  if(buffer.length<4)continue;
  const length=buffer.readUInt32LE(0);
  if(length>32768 || length<2)break;
  if(buffer.length<length+4)continue;
  try {reply({ok:true,data:receive(buffer.subarray(4,4+length))});}
  catch(e){reply({ok:false,error:e.message});}
  break;
}
