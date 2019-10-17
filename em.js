window.onload = main;

const identityMatrix = [[1,0,0],[0,1,0],[0,0,1]]

gameState = {
  viewOrigin: [0,0,0],
  viewRadius: 15,
  viewTheta: Math.PI/2,
  viewPhi: Math.PI,
  dRad: 0,
  dPhi: 0,
  dTheta: 0,
  gameTime: 0
}

document.addEventListener('keydown', evt => {
  if(evt.repeat) { return }
  if(evt.keyCode == 72){ gameState.dPhi -= 0.01 } // H
  if(evt.keyCode == 74){ gameState.dTheta += 0.01 } // J
  if(evt.keyCode == 75){ gameState.dTheta -= 0.01 } // K
  if(evt.keyCode == 76){ gameState.dPhi += 0.01 } // L
  if(evt.keyCode == 81){ gameState.dRad -= 0.01 } // Q
  if(evt.keyCode == 90){ gameState.dRad += 0.01 } // Z
}, false);
document.addEventListener('keyup', evt => {
  if(evt.keyCode == 72){ gameState.dPhi += 0.01 } // H
  if(evt.keyCode == 74){ gameState.dTheta -= 0.01 } // J
  if(evt.keyCode == 75){ gameState.dTheta += 0.01 } // K
  if(evt.keyCode == 76){ gameState.dPhi -= 0.01 } // L
  if(evt.keyCode == 81){ gameState.dRad += 0.01 } // Q
  if(evt.keyCode == 90){ gameState.dRad -= 0.01 } // Z
}, false);

function main(){
  const canvas = document.querySelector("#glCanvas")
  const gl = canvas.getContext("webgl")
  if (gl===null) {alert("No WebGL :(")}

  gl.clearColor(0,0,0,1) // Black Alpha 1
  gl.clear(gl.COLOR_BUFFER_BIT)

  // Vertex shader program
  const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec4 aVertexColor;
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    varying lowp vec4 vColor;
    void main(void) {
      gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
      vColor = aVertexColor;
    }
  `;

  // Fragment shader program
  const fsSource = `
    varying lowp vec4 vColor;
    void main(void) {
      gl_FragColor = vColor;
    }
  `;

  const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

  const programInfo = {
    program: shaderProgram,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
      vertexColor: gl.getAttribLocation(shaderProgram, 'aVertexColor'),
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
      modelViewMatrix: gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
    },
  };

  let mobileSphere = bufferSphere(gl,[0,0,0],0.1,8,8,(theta,phi) => [1-Math.sin(theta),0,1,1])
  mobileSphere.modelPosition=[0,0,1]
  let objects = {
    "zaxis": bufferCurve(gl,t => [0, 0, 50 * t - 25], t => [0, 0, 1 - Math.sin(t * Math.PI), 1], 3), // z axis
    //bufferCurve(gl,t => [-5 * t, 0, 5 * t * t * t * t], t => [t, 0, 1-t,1], 15), // The curve
    "centerSphere": bufferSphere(gl,[0,0,0],0.25,8,8,(theta,phi) => [Math.sin(theta),0,1,1]),
    "mobileSphere": mobileSphere
    //bufferTwoForm(gl,[0,0,0],basis(0),basis(1),0.5,2,[1,0,0,1]), // xy form
    //bufferTwoForm(gl,[0,0,0],basis(1),basis(2),0.5,2,[0,1,0,1]), // yz form
    //bufferTwoForm(gl,[0,0,0],basis(2),basis(0),0.5,2,[0,0,1,1]), // zx form
    //bufferTwoForm(gl,[1,1,1],[0,1,1],[1,1,0],1,0,[0,1,0,1]) // test form
  }

  //for(let radius = 1; radius < 10; radius++)
    //sphereDist(8,8,(t,p) => objects.push(bufferTwoForm(gl,polarToCart(radius,t,p),thetaDirection(radius,t,p),phiDirection(radius,t,p))))

  // Draw the scene repeatedly
  function render(now) {
    let dT = now - gameState.gameTime

    gameState.viewRadius += dT * gameState.dRad
    gameState.viewRadius = Math.max(0.001,gameState.viewRadius)
    gameState.viewPhi += dT * gameState.dPhi * 0.2
    gameState.viewTheta += dT * gameState.dTheta * 0.2
    gameState.viewTheta = Math.min(Math.PI,Math.max(0.001,gameState.viewTheta))
    if(gameState.viewPhi > 2 * Math.PI)
      gameState.viewPhi -= 2 * Math.PI
    if(gameState.viewPhi < 0)
      gameState.viewPhi += 2 * Math.PI

    gameState.gameTime = now

    vec3.add(objects["mobileSphere"].modelPosition,objects["mobileSphere"].modelPosition,[dT * 0.001,0,0])

    let vecs = []
    const chargeDist = [
      {position: objects["mobileSphere"].modelPosition, charge: 3},
      {position: [0,0,0], charge: 1},
    ]
    cartDist((x,y,z) => {
      const eField = calcElectricFieldSigmaCharges(chargeDist,[x,y,z])

      vecs.push(buildVector([x,y,z],vec3.normalize([],eField),[vec3.length(eField),1,0,vec3.length(eField)]))
    }, 1, 5, [0,0,0])
    if(objects["electricField"]){ cleanStandard(gl,objects["electricField"]) }
    objects["electricField"] = bufferMany(gl,vecs,gl.LINES)

    drawScene(gl, programInfo, objects, now);
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

function calcElectricFieldSigmaCharges(charges,pos,k=1){
  let vec = [0,0,0]
  charges.forEach(c => {
    const toPt = vec3.subtract([],pos,c.position)
    const rSq = toPt[0] ** 2 + toPt[1] ** 2 + toPt[2] ** 2
    vec3.add(vec,vec,vec3.scale([],vec3.normalize([],toPt),k * c.charge/rSq))
  })
  return vec
}

function sphereDist(segstheta,segsphi,atPoint){
  for(let i=0; i < segsphi; i++){
    const phi = 2 * Math.PI * i/segsphi
    for(let j = 0; j < segstheta - 2; j++){ // Skip top and bottom
      const theta = Math.PI * (j+1)/(segstheta - 1)
      atPoint(theta,phi)
    }
  }
}

function cartDist(fc, density, scale, center, basis = identityMatrix){
  for(let k = 0; k < 3; k++){
    vec3.normalize(basis[k],basis[k])
    vec3.scale(basis[k],basis[k],1/density)
  }
  const reps = density * scale
  const onSide = 2 * reps + 1
  for(let i=0; i < onSide; i++){
    for(let j=0; j < onSide; j++){
      for(let k=0; k < onSide; k++){
        function extract(h){ return (i - reps) * basis[0][h] + (j-reps) * basis[1][h] + (k-reps) * basis[2][h] }
        fc(center[0] + extract(0), center[1] + extract(1), center[2] + extract(2))
      }
    }
  }
}

function cartToPolar(x,y,z){
  return [Math.sqrt(x*x + y*y + z*z), Math.atan2(Math.sqrt(x*x + y*y),z), Math.atan2(y,x)]
}

function polarToCart(r,theta,phi){
  return [r * Math.cos(phi) * Math.sin(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(theta)]
}

function radialDirection(theta,phi){
  return vec3.normalize([],[Math.cos(phi) * Math.sin(theta), Math.sin(phi) * Math.sin(theta), Math.cos(theta)])
}

function thetaDirection(r,theta,phi){
  return vec3.normalize([],[r * Math.cos(phi) * Math.cos(theta), r * Math.sin(phi) * Math.cos(theta), -r * Math.sin(theta)])
}

function phiDirection(r,theta,phi){
  return vec3.normalize([],[-r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi) * Math.sin(theta), 0])
}

function basis(k,s=1){
  let v = [0,0,0]
  v[k] = s
  return v
}

function drawScene(gl, programInfo, objects, now){
  gl.clearColor(0.5,0.5,0.5,1)
  gl.clearDepth(1)
  gl.enable(gl.DEPTH_TEST)
  gl.depthFunc(gl.LEQUAL)

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

  const projectionMatrix = mat4.create()

  mat4.perspective(projectionMatrix, Math.PI * 0.4, gl.canvas.clientWidth/gl.canvas.clientHeight, 0.1, 100.0)

  const viewMatrix = mat4.create()
  mat4.lookAt(viewMatrix,polarToCart(gameState.viewRadius,gameState.viewTheta,gameState.viewPhi),gameState.viewOrigin,[0,0,1])

  gl.useProgram(programInfo.program)

  // No transpose
  gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, projectionMatrix)

  for(let k in objects){
    let o = objects[k]
    const modelMatrix = mat4.create()
    mat4.multiply(modelMatrix,viewMatrix,modelMatrix)
    mat4.translate(modelMatrix,modelMatrix,o.modelPosition)

    gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, modelMatrix)
    gl.bindBuffer(gl.ARRAY_BUFFER, o.position)
    // no normalize, 0 stride, 0 offset
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0)
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition)

    gl.bindBuffer(gl.ARRAY_BUFFER, o.color)
    // no normalize, 0 stride, 0 offset
    gl.vertexAttribPointer(programInfo.attribLocations.vertexColor, 4, gl.FLOAT, false, 0, 0)
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexColor)

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, o.indices);
    // 0 offset
    gl.drawElements(o.drawStyle , o.indexCount, gl.UNSIGNED_SHORT, 0);
  }

}

function approxCurve(fp,fc,segs){
  let positions = new Float32Array(3*segs)
  let colors = new Float32Array(4*segs)
  let indices = new Uint16Array(segs)
  for(let i=0; i < segs; i++){
    const t = i/(segs - 1)
    for(let k=0; k < 3; k++){
      positions[3 * i + k] = fp(t)[k]
    }
    for(let k=0; k < 4; k++){
      colors[4 * i + k] = fc(t)[k]
    }
    indices[i] = i
  }
  return {positions: positions, colors: colors, indices: indices}
}

function modul(n,k){
  return ((n % k) + k) % k
}

function approxSphere(center,radius,segstheta,segsphi,fc){
  let positions = new Float32Array(3 * (2 + segsphi * (segstheta - 2))) // Top, Bottom, each segsphi has segstheta-2 points
  let colors = new Float32Array(4 * (2 + segsphi * (segstheta - 2)))
  const trisinVertShaft = (segstheta - 3) * 2 + 2
  let indices = new Uint16Array(3 * (trisinVertShaft * segsphi + 2 * (segstheta - 3) + 1))
  for(let i=0; i < segsphi; i++){
    const phi = 2 * Math.PI * i/segsphi
    for(let j = 0; j < segstheta - 2; j++){ // Skip top and bottom
      const theta = Math.PI * (j+1)/(segstheta - 1)
      const dotsdone = 2 + (segstheta - 2) * i + j // First two are top and bottom, then (segstheta - 2) is size of vertical shaft and shift by minus one for indexing
      positions[3 * dotsdone + 0] = center[0] + radius * Math.cos(phi) * Math.sin(theta)
      positions[3 * dotsdone + 1] = center[1] + radius * Math.sin(phi) * Math.sin(theta)
      positions[3 * dotsdone + 2] = center[2] + radius * Math.cos(theta)
      for(let k=0; k < 4; k++){
        colors[4 * dotsdone + k] = fc(theta,phi)[k]
      }
      if(j < segstheta - 3){
        // Points right
        indices[3 * (trisinVertShaft * i + (2 * j + 1)) + 0] = 2 + (segstheta - 2) * i + j
        indices[3 * (trisinVertShaft * i + (2 * j + 1)) + 1] = 2 + (segstheta - 2) * i + (j+1)
        indices[3 * (trisinVertShaft * i + (2 * j + 1)) + 2] = 2 + (segstheta - 2) * modul(i+1, segsphi) + j

        // Points left
        indices[3 * (trisinVertShaft * i + (2 * j + 2)) + 0] = 2 + (segstheta - 2) * i + j
        indices[3 * (trisinVertShaft * i + (2 * j + 2)) + 1] = 2 + (segstheta - 2) * i + (j+1)
        indices[3 * (trisinVertShaft * i + (2 * j + 2)) + 2] = 2 + (segstheta - 2) * modul(i-1, segsphi) + (j+1)
      }
    }
    // First tri on top
    indices[3 * (trisinVertShaft * i + 0) + 0] = 0
    indices[3 * (trisinVertShaft * i + 0) + 1] = 2 + (segstheta - 2) * i + 0
    indices[3 * (trisinVertShaft * i + 0) + 2] = 2 + (segstheta - 2) * modul(i+1, segsphi) + 0

    // Last tri on bottom
    indices[3 * (trisinVertShaft * i + 2 * (segstheta - 3) + 1) + 0] = 1
    indices[3 * (trisinVertShaft * i + 2 * (segstheta - 3) + 1) + 1] = 2 + (segstheta - 2) * i + (segstheta - 3)
    indices[3 * (trisinVertShaft * i + 2 * (segstheta - 3) + 1) + 2] = 2 + (segstheta - 2) * modul(i-1, segsphi) + (segstheta - 3)
  }
  // Top
  positions[0 + 0] = center[0] + 0
  positions[0 + 1] = center[1] + 0
  positions[0 + 2] = center[2] + radius
  // Bottom
  positions[3 + 0] = center[0] + 0
  positions[3 + 1] = center[1] + 0
  positions[3 + 2] = center[2] - radius

  for(let k=0; k < 4; k++){
    colors[k] = fc(0,0)[k]
    colors[k+4] = fc(0,Math.PI)[k]
  }
  return {positions: positions, colors: colors, indices: indices}
}

function buildVector(center,vector,plusColor = [1,1,0,1],minusColor = [0.25,0.25,0.25,1]){
  minusColor[3] = plusColor[3] // Inherit alpha from plusColor
  return {positions: [center,vec3.add([],center,vector)].flat(), colors: [minusColor,plusColor].flat(), indices: [0,1]}
}

function buildVectorField(gl,fv,density,scale,center){
  let vecs = []
  cartDist((x,y,z) => {
    const v = fv(x,y,z)
    vecs.push(buildVector([x,y,z],vec3.normalize([],v),[vec3.length(v),1,0,1]))
  },density,scale,center)
}

function bufferVector(gl,vec){
  return bufferStandard(gl,vec,gl.LINES)
}

function bufferTwoForm(gl,center,baseOne,baseTwo,density = 1, scale = 0,plusColor = [1,1,0,1],minusColor = [0.25,0.25,0.25,1]){
  vec3.normalize(baseOne,baseOne)
  vec3.normalize(baseTwo,baseTwo)
  vec3.scale(baseOne,baseOne,1/density)
  vec3.scale(baseTwo,baseTwo,1/density)

  let positions = []
  let colors = []
  let indices = []

  const reps = density * scale

  const linesOnSide = 2 * reps + 1
  let along = []
  vec3.cross(along,baseOne,baseTwo)
  vec3.normalize(along,along)
  //vec3.scale(along,along,scale)
  const length = 0.2
  for(let i = 0; i < linesOnSide; i++){
    for(let j = 0; j < linesOnSide; j++){
      for(let k = 0; k < 3; k++){
        positions[3 * 2 * (linesOnSide * i + j) + k] = -length * along[k] + center[k] + (i - reps) * baseOne[k] + (j - reps) * baseTwo[k]
        positions[3 * 2 * (linesOnSide * i + j) + 3 + k] = length * along[k] + center[k] + (i - reps) * baseOne[k] + (j - reps) * baseTwo[k]
      }
      for(let k = 0; k < 4; k++){
        colors[4 * 2 * (linesOnSide * i + j) + k] = minusColor[k]
        colors[4 * 2 * (linesOnSide * i + j) + 4 + k] = plusColor[k]
      }

      indices[2 * (linesOnSide * i + j) + 0] = 2 * (linesOnSide * i + j) + 0
      indices[2 * (linesOnSide * i + j) + 1] = 2 * (linesOnSide * i + j) + 1
    }
  }
  return bufferStandard(gl,{positions: positions, colors: colors, indices: indices},gl.LINES)
}

function bufferMany(gl,os,ds){
  let offset = 0
  for(i = 0; i < os.length; i++){
    os[i].indices = os[i].indices.map(k => offset + k)
    offset += os[i].positions.length / 3
  }
  return bufferStandard(gl,{positions: os.flatMap(o => o.positions), colors: os.flatMap(o => o.colors), indices: os.flatMap(o => o.indices)},ds)
}

function cleanStandard(gl,o){
  gl.deleteBuffer(o.position)
  gl.deleteBuffer(o.color)
  gl.deleteBuffer(o.indices)
}

function bufferStandard(gl,o,ds,cnt = o.indices.length){
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(o.positions), gl.STATIC_DRAW);

  const colorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(o.colors), gl.STATIC_DRAW);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(o.indices), gl.STATIC_DRAW);

  return {
    position: positionBuffer,
    color: colorBuffer,
    indices: indexBuffer,
    drawStyle: ds,
    indexCount: cnt,
    modelPosition: [0,0,0]
  };
}

function bufferSphere(gl,center,radius,segstheta,segsphi,fc) {
  return bufferStandard(gl,approxSphere(center,radius,segstheta,segsphi,fc),gl.TRIANGLES)
}

function bufferCurve(gl,fp,fc,segs) {
  return bufferStandard(gl,approxCurve(fp,fc,segs),gl.LINE_STRIP)
}

//
// Initialize a shader program, so WebGL knows how to draw our data
//
function initShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

  // Create the shader program

  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  // If creating the shader program failed, alert

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
    return null;
  }

  return shaderProgram;
}

//
// creates a shader of the given type, uploads the source and
// compiles it.
//
function loadShader(gl, type, source) {
  const shader = gl.createShader(type);

  // Send the source to the shader object

  gl.shaderSource(shader, source);

  // Compile the shader program

  gl.compileShader(shader);

  // See if it compiled successfully

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}
