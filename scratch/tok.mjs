import 'dotenv/config';
import jwt from 'jsonwebtoken';
console.log(jwt.sign({id:'5bb592fd-1e95-4091-a9b9-05f30a0bff47',email:'phase2@example.test',role:'user',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+86400},process.env.JWT_SECRET,{algorithm:'HS512'}));
