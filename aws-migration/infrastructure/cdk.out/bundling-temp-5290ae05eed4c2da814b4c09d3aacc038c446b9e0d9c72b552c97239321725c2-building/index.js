var O=Object.create;var c=Object.defineProperty;var A=Object.getOwnPropertyDescriptor;var P=Object.getOwnPropertyNames;var L=Object.getPrototypeOf,$=Object.prototype.hasOwnProperty;var U=(e,t)=>{for(var s in t)c(e,s,{get:t[s],enumerable:!0})},w=(e,t,s,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let n of P(t))!$.call(e,n)&&n!==s&&c(e,n,{get:()=>t[n],enumerable:!(r=A(t,n))||r.enumerable});return e};var k=(e,t,s)=>(s=e!=null?O(L(e)):{},w(t||!e||!e.__esModule?c(s,"default",{value:e,enumerable:!0}):s,e)),M=e=>w(c({},"__esModule",{value:!0}),e);var B={};U(B,{handler:()=>G});module.exports=M(B);var h=require("pg"),R=k(require("ioredis")),_=require("@aws-sdk/client-secrets-manager"),d=null,p=null,m=null,v=new _.SecretsManagerClient({}),{DB_SECRET_ARN:x,REDIS_HOST:H,REDIS_PORT:b="6379",ENVIRONMENT:J="staging"}=process.env,V={POSTS_LIST:60,POST_DETAIL:300,USER_FEED:30};async function q(){if(m)return m;let e=new _.GetSecretValueCommand({SecretId:x}),t=await v.send(e);return m=JSON.parse(t.SecretString||"{}"),m}async function W(){if(d)return d;let e=await q(),t={host:e.host,port:e.port||5432,database:e.dbname||"smuppy",user:e.username,password:e.password,ssl:{rejectUnauthorized:!1},max:10,idleTimeoutMillis:3e4,connectionTimeoutMillis:5e3};return d=new h.Pool(t),d}function F(){return p||(p=new R.default({host:H,port:parseInt(b),tls:{},maxRetriesPerRequest:3,lazyConnect:!0}),p)}function S(e,t){return{statusCode:e,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Credentials":"true","Cache-Control":e===200?"public, max-age=60":"no-cache"},body:JSON.stringify(t)}}var G=async e=>{let t=Date.now();try{let{limit:s="20",cursor:r,type:n="all",userId:i}=e.queryStringParameters||{},o=Math.min(parseInt(s),100),f=e.requestContext.authorizer?.claims?.sub,C=`posts:list:${n}:${i||"all"}:${r||"first"}:${o}`,T=F();if(n!=="following")try{let a=await T.get(C);if(a)return S(200,{...JSON.parse(a),cached:!0,latency:Date.now()-t})}catch{}let D=await W(),l,u;n==="following"&&f?(l=`
        SELECT p.id, p.user_id as "authorId", p.content, p.media_urls as "mediaUrls", p.media_type as "mediaType",
               p.likes_count as "likesCount", p.comments_count as "commentsCount", p.created_at as "createdAt",
               u.username, u.full_name as "fullName", u.avatar_url as "avatarUrl", u.is_verified as "isVerified", u.account_type as "accountType",
               EXISTS(SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $1) as "isLiked"
        FROM posts p
        JOIN users u ON p.user_id = u.id
        JOIN follows f ON f.following_id = p.user_id AND f.follower_id = $1 AND f.status = 'accepted'
        WHERE p.deleted_at IS NULL ${r?"AND p.created_at < $3":""}
        ORDER BY p.created_at DESC LIMIT $2
      `,u=r?[f,o+1,new Date(parseInt(r))]:[f,o+1]):i?(l=`
        SELECT p.id, p.user_id as "authorId", p.content, p.media_urls as "mediaUrls", p.media_type as "mediaType",
               p.likes_count as "likesCount", p.comments_count as "commentsCount", p.created_at as "createdAt",
               u.username, u.full_name as "fullName", u.avatar_url as "avatarUrl", u.is_verified as "isVerified", u.account_type as "accountType"
        FROM posts p JOIN users u ON p.user_id = u.id
        WHERE p.user_id = $1 AND p.deleted_at IS NULL ${r?"AND p.created_at < $3":""}
        ORDER BY p.created_at DESC LIMIT $2
      `,u=r?[i,o+1,new Date(parseInt(r))]:[i,o+1]):(l=`
        SELECT p.id, p.user_id as "authorId", p.content, p.media_urls as "mediaUrls", p.media_type as "mediaType",
               p.likes_count as "likesCount", p.comments_count as "commentsCount", p.created_at as "createdAt",
               u.username, u.full_name as "fullName", u.avatar_url as "avatarUrl", u.is_verified as "isVerified", u.account_type as "accountType"
        FROM posts p JOIN users u ON p.user_id = u.id
        WHERE p.deleted_at IS NULL ${r?"AND p.created_at < $2":""}
        ORDER BY CASE WHEN p.created_at > NOW() - INTERVAL '24 hours' THEN p.likes_count * 2 + p.comments_count ELSE p.likes_count + p.comments_count END DESC, p.created_at DESC
        LIMIT $1
      `,u=r?[o+1,new Date(parseInt(r))]:[o+1]);let y=await D.query(l,u),E=y.rows.length>o,I=E?y.rows.slice(0,o):y.rows,N=I.map(a=>({id:a.id,authorId:a.authorId,content:a.content,mediaUrls:a.mediaUrls||[],mediaType:a.mediaType,likesCount:parseInt(a.likesCount)||0,commentsCount:parseInt(a.commentsCount)||0,createdAt:a.createdAt,isLiked:a.isLiked||!1,author:{id:a.authorId,username:a.username,fullName:a.fullName,avatarUrl:a.avatarUrl,isVerified:a.isVerified,accountType:a.accountType}})),g={posts:N,nextCursor:E?I[I.length-1].createdAt.getTime().toString():null,hasMore:E,total:N.length};if(n!=="following")try{await T.setex(C,V.POSTS_LIST,JSON.stringify(g))}catch{}return S(200,{...g,cached:!1,latency:Date.now()-t})}catch(s){return console.error("Error fetching posts:",s),S(500,{error:"Internal server error",message:J==="staging"?s.message:void 0})}};0&&(module.exports={handler});
//# sourceMappingURL=index.js.map
