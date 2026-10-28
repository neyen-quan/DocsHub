const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.env.DOCSHUB_SOURCE_ROOT||path.join(__dirname,'..'));
require(require.resolve('esbuild',{paths:[root]})).buildSync({entryPoints:[path.join(root,'src/main.jsx')],bundle:true,minify:true,outdir:path.join(root,'dist/assets'),define:{'process.env.NODE_ENV':'"production"'},target:'chrome148',legalComments:'eof'});
fs.copyFileSync(path.join(root,'index.html'),path.join(root,'dist/index.html'));
fs.copyFileSync(path.join(root,'assets/docshub.svg'),path.join(root,'dist/assets/docshub.svg'));
