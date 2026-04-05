const pg = require("pg");
const c = new pg.Client("postgresql://postgres:postgres@localhost:5433/ultrasooq");
async function seed() {
  await c.connect();
  console.log("Connected\n");
  const brandAliases = {"Sony":{ar:["سوني"],zh:["索尼"]},"Samsung":{ar:["سامسونج"],zh:["三星"]},"Apple":{ar:["ابل","آبل"],zh:["苹果"]},"Nike":{ar:["نايكي"],zh:["耐克"]},"Adidas":{ar:["اديداس"],zh:["阿迪达斯"]},"HP":{ar:["اتش بي"],zh:["惠普"]},"Dell":{ar:["ديل"],zh:["戴尔"]},"Lenovo":{ar:["لينوفو"],zh:["联想"]},"Huawei":{ar:["هواوي"],zh:["华为"]},"Xiaomi":{ar:["شاومي"],zh:["小米"]},"Bose":{ar:["بوز"]},"Canon":{ar:["كانون"],zh:["佳能"]},"Toyota":{ar:["تويوتا"],zh:["丰田"]},"Honda":{ar:["هوندا"],zh:["本田"]},"BMW":{ar:["بي ام دبليو"],zh:["宝马"]},"Mercedes":{ar:["مرسيدس"],zh:["奔驰"]},"Dyson":{ar:["دايسون"],zh:["戴森"]},"Microsoft":{ar:["مايكروسوفت"],zh:["微软"]},"Google":{ar:["جوجل"],zh:["谷歌"]},"Logitech":{ar:["لوجيتك"],zh:["罗技"]},"LG":{ar:["إل جي"],zh:["乐金"]},"Panasonic":{ar:["باناسونيك"],zh:["松下"]},"Philips":{ar:["فيليبس"],zh:["飞利浦"]},"Bosch":{ar:["بوش"],zh:["博世"]},"Nvidia":{ar:["إنفيديا"],zh:["英伟达"]},"Intel":{ar:["إنتل"],zh:["英特尔"]},"JBL":{ar:["جي بي ال"]},"Nikon":{ar:["نيكون"],zh:["尼康"]},"Corsair":{ar:["كورسير"],zh:["海盗船"]},"AMD":{ar:["اي ام دي"],zh:["超威"]}};
  let bc=0;
  for(const[n,a]of Object.entries(brandAliases)){const r=await c.query('UPDATE "Brand" SET aliases=$1::jsonb WHERE "brandName"=$2 AND "deletedAt" IS NULL',[JSON.stringify(a),n]);if(r.rowCount>0){console.log("  + brand:",n);bc++;}}
  console.log("Brands:",bc,"\n");

  const catAliases={"Electronics":{ar:["الكترونيات"],zh:["电子产品"],fr:["électronique"]},"Mobile Phones":{ar:["هواتف","جوالات","موبايل"],zh:["手机"]},"Smartphones":{ar:["هاتف ذكي","هواتف ذكية"],zh:["智能手机"]},"Laptops":{ar:["لابتوب","حاسوب محمول"],zh:["笔记本电脑"],fr:["ordinateur portable"]},"Tablets":{ar:["تابلت"],zh:["平板电脑"]},"Headphones":{ar:["سماعات","سماعة","سماعات رأس"],zh:["耳机"],fr:["écouteurs","casque"]},"Cameras":{ar:["كاميرا","كاميرات"],zh:["相机"]},"Shoes":{ar:["أحذية","حذاء"],zh:["鞋子"],fr:["chaussures"]},"Clothing":{ar:["ملابس","أزياء"],zh:["服装"],fr:["vêtements"]},"Watches":{ar:["ساعات"],zh:["手表"]},"Bags":{ar:["حقائب","شنط"],zh:["包"]},"Furniture":{ar:["أثاث"],zh:["家具"]},"Kitchen":{ar:["مطبخ"],zh:["厨房"]},"Beauty":{ar:["جمال","تجميل"],zh:["美容"]},"Sports":{ar:["رياضة"],zh:["运动"]},"Auto Parts":{ar:["قطع غيار","قطع سيارات"],zh:["汽车配件"]},"Television":{ar:["تلفزيون","شاشة"],zh:["电视"]},"Office":{ar:["مكتب"],zh:["办公用品"]}};
  let cc=0;
  for(const[n,a]of Object.entries(catAliases)){const r=await c.query('UPDATE "Category" SET aliases=$1::jsonb WHERE name ILIKE $2 AND status=$3',[JSON.stringify(a),"%"+n+"%","ACTIVE"]);if(r.rowCount>0){console.log("  + cat:",n,"(",r.rowCount,")");cc+=r.rowCount;}}
  console.log("Categories:",cc,"\n");

  const ucs=[{c:"Headphones",u:"gym",s:{waterproof:"IPX4+",connectivity:"Bluetooth"},t:["sport","sweatproof"]},{c:"Headphones",u:"office",s:{noise_cancellation:"active"},t:["work","calls"]},{c:"Headphones",u:"gaming",s:{connectivity:"wired"},t:["gaming"]},{c:"Headphones",u:"travel",s:{noise_cancellation:"active"},t:["travel"]},{c:"Headphones",u:"running",s:{waterproof:"IPX5+"},t:["running","sport"]},{c:"Laptops",u:"gaming",s:{ram:"16GB+",gpu:"dedicated"},t:["gaming"]},{c:"Laptops",u:"school",s:{weight:"lightweight"},t:["student","affordable"]},{c:"Laptops",u:"video editing",s:{ram:"32GB+"},t:["creative"]},{c:"Laptops",u:"business",s:{weight:"lightweight"},t:["business"]},{c:"Laptops",u:"programming",s:{ram:"16GB+"},t:["developer"]},{c:"Smartphones",u:"photography",s:{camera:"48MP+"},t:["camera"]},{c:"Smartphones",u:"gaming",s:{ram:"8GB+"},t:["gaming"]},{c:"Cameras",u:"vlogging",s:{video:"4K"},t:["vlog","youtube"]},{c:"Shoes",u:"running",s:{cushioning:"high"},t:["running"]},{c:"Shoes",u:"hiking",s:{waterproof:"true"},t:["hiking"]},{c:"Watches",u:"fitness",s:{heart_rate:"true"},t:["fitness"]},{c:"Kitchen",u:"baking",s:{},t:["baking"]},{c:"Sports",u:"yoga",s:{},t:["yoga"]}];
  let uc=0;
  for(const u of ucs){const cat=await c.query('SELECT id FROM "Category" WHERE name ILIKE $1 AND status=$2 LIMIT 1',["%"+u.c+"%","ACTIVE"]);if(!cat.rows.length)continue;try{await c.query('INSERT INTO use_case_mappings ("categoryId","useCase","impliedSpecs","impliedTags",source,status,"createdAt","updatedAt") VALUES($1,$2,$3::jsonb,$4::jsonb,$5,$6,NOW(),NOW()) ON CONFLICT("categoryId","useCase") DO UPDATE SET "impliedSpecs"=$3::jsonb,"impliedTags"=$4::jsonb',[cat.rows[0].id,u.u,JSON.stringify(u.s),JSON.stringify(u.t),"manual","ACTIVE"]);console.log("  + uc:",u.c,"+",u.u);uc++;}catch(e){}}
  console.log("Use-cases:",uc,"\n");

  const disamb=[{t:"filter",m:[{c:"Auto Parts",r:"oil filter, air filter, fuel filter",p:3},{c:"Kitchen",r:"water filter, coffee filter",p:2}]},{t:"apple",m:[{c:"Electronics",r:"Apple Inc. products",p:5}]},{t:"mouse",m:[{c:"Electronics",r:"computer mouse",p:3}]},{t:"tablet",m:[{c:"Electronics",r:"tablet computer",p:3}]},{t:"case",m:[{c:"Electronics",r:"phone case, laptop case",p:3}]},{t:"monitor",m:[{c:"Electronics",r:"computer monitor",p:3}]},{t:"speaker",m:[{c:"Electronics",r:"bluetooth speaker",p:3}]},{t:"charger",m:[{c:"Electronics",r:"phone charger, wireless charger",p:3}]},{t:"cover",m:[{c:"Electronics",r:"phone cover, laptop cover",p:3},{c:"Furniture",r:"sofa cover, mattress cover",p:2}]}];
  let td=0;
  for(const d of disamb){for(const m of d.m){const cat=await c.query('SELECT id FROM "Category" WHERE name ILIKE $1 AND status=$2 LIMIT 1',["%"+m.c+"%","ACTIVE"]);if(!cat.rows.length)continue;try{await c.query('INSERT INTO term_disambiguations(term,"categoryId","resolvedMeaning",priority,status,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,NOW(),NOW())',[d.t,cat.rows[0].id,m.r,m.p,"ACTIVE"]);console.log("  + disamb:",d.t,"->",m.r.substring(0,30));td++;}catch(e){}}}
  console.log("Disambiguations:",td,"\n");

  const accs=[{s:"Laptops",t:"Bags",v:0.9},{s:"Smartphones",t:"Headphones",v:0.8},{s:"Cameras",t:"Bags",v:0.8}];
  let ac=0;
  for(const a of accs){const s=await c.query('SELECT id FROM "Category" WHERE name ILIKE $1 AND status=$2 LIMIT 1',["%"+a.s+"%","ACTIVE"]);const t=await c.query('SELECT id FROM "Category" WHERE name ILIKE $1 AND status=$2 LIMIT 1',["%"+a.t+"%","ACTIVE"]);if(!s.rows.length||!t.rows.length)continue;try{await c.query('INSERT INTO accessory_links("sourceCategoryId","accessoryCategoryId",strength,bidirectional,status,"createdAt","updatedAt") VALUES($1,$2,$3,false,$4,NOW(),NOW()) ON CONFLICT DO NOTHING',[s.rows[0].id,t.rows[0].id,a.v,"ACTIVE"]);console.log("  + acc:",a.s,"->",a.t);ac++;}catch(e){}}
  console.log("Accessories:",ac,"\n");

  console.log("=== Rebuilding search_vector ===");
  const sv=await c.query("UPDATE \"Product\" SET search_vector=to_tsvector('simple',COALESCE(\"productName\",'')||' '||COALESCE(description,'')||' '||COALESCE(\"shortDescription\",'')||' '||COALESCE(\"skuNo\",'')) WHERE status='ACTIVE' AND \"deletedAt\" IS NULL");
  console.log("Products:",sv.rowCount,"\n");

  console.log("=== DONE ===");
  console.log("Brands:",bc,"| Categories:",cc,"| Use-cases:",uc);
  console.log("Disambiguations:",td,"| Accessories:",ac,"| Products:",sv.rowCount);
  await c.end();
}
seed().catch(e=>{console.error("FAIL:",e.message);process.exit(1);});
