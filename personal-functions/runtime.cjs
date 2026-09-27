const {initializeApp,applicationDefault,getApps}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const {createHash}=require('node:crypto');
const app=getApps()[0]||initializeApp({credential:applicationDefault(),projectId:'pti-app-2ab59'});
module.exports={app,db:getFirestore(app,'personal'),auth:getAuth(app),hash:s=>createHash('sha256').update(s).digest('hex'),now:()=>new Date().toISOString()};
