import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

// Read the actual exported RGBA PNGs without adding an image dependency.
function png(name) {
  const data = readFileSync('public/figma/' + name + '.png');
  assert.equal(data.subarray(1,4).toString(), 'PNG');
  const width=data.readUInt32BE(16), height=data.readUInt32BE(20);
  assert.equal(data[24],8); assert.equal(data[25],6); assert.equal(data[28],0);
  const chunks=[];
  for(let offset=8;offset<data.length;) {
    const size=data.readUInt32BE(offset);
    if(data.toString('ascii',offset+4,offset+8)==='IDAT') chunks.push(data.subarray(offset+8,offset+8+size));
    offset+=size+12;
  }
  const raw=inflateSync(Buffer.concat(chunks)), stride=width*4;
  const pixels=Buffer.alloc(stride*height);
  const paeth=(a,b,c)=>{ const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c); return pa<=pb&&pa<=pc?a:pb<=pc?b:c; };
  for(let y=0;y<height;y++) {
    const filter=raw[y*(stride+1)];
    assert.ok(filter<=4);
    for(let x=0;x<stride;x++) {
      const i=y*stride+x,left=x>=4?pixels[i-4]:0,up=y?pixels[i-stride]:0,corner=y&&x>=4?pixels[i-stride-4]:0;
      const predictor=[0,left,up,Math.floor((left+up)/2),paeth(left,up,corner)][filter];
      pixels[i]=(raw[y*(stride+1)+1+x]+predictor)&255;
    }
  }
  return { width,height,pixel:(x,y)=>[...pixels.subarray((y*width+x)*4,(y*width+x)*4+4)],pixels };
}
function assertColor(name,rgb) {
  const image=png(name);let visible=0;
  for(let i=0;i<image.pixels.length;i+=4) if(image.pixels[i+3]===255) {
    visible++; assert.deepEqual([...image.pixels.subarray(i,i+3)],rgb,name+' must use the approved color');
  }
  assert.ok(visible>100,name+' must not be empty');
  assert.equal(image.width,72);assert.equal(image.height,72);
}
const swift=readFileSync('ios/App/App/FACTeaCameraPlugin.swift','utf8');

test('UI-01 uses four transparent green Figma corners without connecting scan edges',()=>{
  const image=png('uc02-scan-corners');
  assert.equal(image.width,351*3);assert.equal(image.height,414*3);
  for(const [x,y] of [[175*3,0],[175*3,413*3],[0,207*3],[350*3,207*3],[175*3,207*3]]) assert.equal(image.pixel(x,y)[3],0);
  for(const [x0,y0] of [[0,0],[image.width-120,0],[0,image.height-132],[image.width-120,image.height-132]]) {
    let count=0;
    for(let y=y0;y<y0+132;y++) for(let x=x0;x<x0+120;x++) if(image.pixel(x,y)[3]) count++;
    assert.ok(count>100);
  }
  assert.match(swift,/finder\.image = icon\("uc02-scan-corners"\)\?\.resizableImage/);
  assert.match(swift,/finder\.frame = finderRect\s*scanner\?\.regionOfInterest = finderRect/);
  assert.doesNotMatch(swift,/lineDashPattern/);
});

test('UI-02 searching asset is white and rotation is removed on status/lifecycle changes',()=>{
  assertColor('uc02-progress-white',[255,255,255]);
  assert.match(swift,/CABasicAnimation\(keyPath: "transform.rotation.z"\)/);
  assert.match(swift,/rotation\.repeatCount = \.infinity/);
  assert.match(swift,/guard searching, cameraActive, !cameraUnavailable, !closed else \{\s*toastIcon\.layer\.removeAnimation/);
  assert.match(swift,/updateSearchAnimation\(state == \.barcode \|\| state == \.identifying\)/);
  assert.match(swift,/stopScanner\(\) \{\s*cameraActive = false/);
});

test('UI-09 shortcut expands on the first completed tap and navigates only on the second',()=>{
  assert.match(swift,/manualWidth: CGFloat = manualExpanded \? 168 : 48/);
  assert.match(swift,/manualLabel\.text = "ADD NEW TEA"/);
  assert.match(swift,/roundControl\(manual,[^\n]*#selector\(openManualShortcut\)/);
  assert.match(swift,/deinit \{\s*manualCollapseTask\?\.cancel\(\)/);
  assert.match(swift,/stopScanner\(\) \{[\s\S]*?cancelManualShortcut\(\)/);
  assert.match(swift,/finish\(_ action: String\) \{[\s\S]*?stopScanner\(\)/);
});

test('UI-04 known barcode has its own green success asset, wording and guarded automatic navigation',()=>{
  assertColor('uc02-success',[55,209,125]);
  assert.match(swift,/case \.knownBarcode:\s*title = "Found your tea!"/);
  assert.match(swift,/state == \.knownBarcode \{\s*toastIcon\.image = icon\("uc02-success"\)/);
  assert.match(swift,/self\.state == \.knownBarcode, self\.acceptedBarcodeID == id/);
  assert.match(swift,/barcodeNavigation\?\.cancel\(\)/);
});

test('UI-05 delete button uses dark translucent surface and original white template glyph',()=>{
  assert.match(swift,/button\.backgroundColor = name == "uc02-close" \? \.clear : charcoal\.withAlphaComponent\(0\.8\)/);
  assert.match(swift,/name == "uc02-delete" \? icon\(name\)\?\.withRenderingMode\(\.alwaysTemplate\)/);
  assert.match(swift,/button\.tintColor = \.white/);
  assert.match(swift,/selector: #selector\(deletePhoto\)/);
});

test('UI-06 no-match status and action hint use separate white and lime Figma assets',()=>{
  assertColor('uc02-info-white',[255,255,255]);
  assertColor('uc02-info-green',[185,252,105]);
  assert.match(swift,/state == \.noMatch \{\s*toastIcon\.image = icon\("uc02-info-white"\)/);
  assert.match(swift,/hintIcon\.image = icon\(cameraUnavailable \|\| state == \.networkError \? "uc02-cancel" : "uc02-info-green"\)/);
});

test('UI-07 remaining photo count selects 03D/03E after deletion while the three-photo limit remains',()=>{
  assert.match(swift,/instruction = photos\.count >= 2 \? "Let's add your tea" : "Scan brewing details"/);
  assert.match(swift,/case \.noMatch:[\s\S]*?buttonTitle = "ADD NEW TEA"/);
  assert.match(swift,/photos\.remove\(at: selectedPhoto\)[\s\S]*?else \{ identifyPhotos\(trigger: "photo_deleted"\) \}/);
  assert.match(swift,/photos\.count < 3/);
});
