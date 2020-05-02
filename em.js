window.onload = main;

// ECS explanation:
//
// Typical object is
// {"render": {...}, "charged": +1, "dynamics": function(dT,objects){...}, "located": [x,y,z]}
//
// Typical viewer state is
const typicalViewer = {origin: [0,0,0], radius: 15, theta: Math.PI/2, phi: Math.PI}

/*if(localStorage.getItem("viewRadius")){
  typicalViewer.radius = parseFloat(localStorage.getItem("viewRadius"))
  typicalViewer.theta = parseFloat(localStorage.getItem("viewTheta"))
  typicalViewer.phi = parseFloat(localStorage.getItem("viewPhi"))
}*/

snapshotObjects = {}

unlocatedObjects = []

const identityMatrix = [[1,0,0],[0,1,0],[0,0,1]]

gameState = {
  viewIndex: 0,
  activeViewer: 0,
  dObject: 0,
  dRad: 0,
  dPhi: 0,
  dTheta: 0,
  gameTime: 0,
  viewports: [
    {x: 0.0,y: 0.0,w: 0.5,h: 0.5, viewer: Object.assign({},typicalViewer), objects: {}},
    {x: 0.5,y: 0.0,w: 0.5,h: 0.5, viewer: Object.assign({},typicalViewer), objects: {}},
    {x: 0.0,y: 0.5,w: 0.5,h: 0.5, viewer: Object.assign({},typicalViewer), objects: {}},
    {x: 0.5,y: 0.5,w: 0.5,h: 0.5, viewer: Object.assign({},typicalViewer), objects: {}}
  ]
}

function respondToViewChanges(viewer, dT){
  viewer.radius += dT * gameState.dRad
  viewer.radius = Math.max(0.01,viewer.radius)
  viewer.phi += dT * gameState.dPhi * 0.2
  viewer.theta += dT * gameState.dTheta * 0.2
  viewer.theta = Math.min(Math.PI,Math.max(0.001,viewer.theta))
  if(viewer.phi > 2 * Math.PI)
    viewer.phi -= 2 * Math.PI
  if(viewer.phi < 0)
    viewer.phi += 2 * Math.PI
  return viewer
}


document.addEventListener('keydown', evt => {
  if(evt.repeat) { return }
  if(evt.keyCode == 72){ gameState.dPhi -= 0.01 } // H
  if(evt.keyCode == 74){ gameState.dTheta += 0.01 } // J
  if(evt.keyCode == 75){ gameState.dTheta -= 0.01 } // K
  if(evt.keyCode == 76){ gameState.dPhi += 0.01 } // L
  if(evt.keyCode == 81){ gameState.dRad -= 0.01 } // Q
  if(evt.keyCode == 90){ gameState.dRad += 0.01 } // Z
  if(evt.keyCode == 69){ gameState.viewIndex++ } // E
  if(evt.keyCode == 67){ gameState.viewIndex-- } // C
  if(evt.keyCode == 84){ gameState.activeViewer = (gameState.activeViewer + 1) % gameState.viewports.length } // T
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
  const canvas = document.getElementById("glCanvas")
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

    const tinyElectron = {
      located: [2,0,2],
      charged: -0.5,
      render: bufferSphere(gl,[0,0,0],0.1,8,8,(theta,phi) => [1-Math.sin(theta),0,1,1]),
      dynamics: electroDynamics,
      kinematics: {momentum: [0,10,0], mass: 1000}
    }

  gameState.viewports.forEach(vp => {vp.objects["basis"] = {located: [0,0,0], render: bufferBasis(gl)}})
  gameState.viewports[0].objects["zaxis"] = {render: bufferCurve(gl,t => [0, 0, 50 * t - 25], t => [0, 0, 1 - Math.sin(t * Math.PI), 1], 3)}
  Object.assign(gameState.viewports[1].objects,{
    "proton": {
      render: bufferSphere(gl,[0,0,0],0.25,8,8,(theta,phi) => [Math.sin(theta),0,1,1]),
      located: [0,0,0],
      kinematics: {momentum: [0,0,0], mass: Infinity},
      dynamics: electroDynamics,
      charged: 15
      },
    "electron": {
      render: bufferSphere(gl,[0,0,0],0.1,8,8,(theta,phi) => [1-Math.sin(theta),0,1,1]),
      located: [15,0,0],
      kinematics: {momentum: [0,40,0], mass: 1000},
      dynamics: electroDynamics,
      charged: -1
      },
    "electricField": {dynamics: function(dT,objects){
      let vecs = []
      const chargeDist = getChargeDist(objects)
      const epsilon = 0.1

      //console.time("E field calc")
      for(const q of chargeDist){
        if(q.boring){continue}
        cartDist((x,y,z) => {
          const eField = calcElectricFieldSigmaCharges(chargeDist,[x,y,z])
          const fieldStrength = vec3.length(eField)

          if(fieldStrength > epsilon){
            vecs.push(buildVector([x,y,z],vec3.normalize([],eField),[vec3.length(eField),1,0,vec3.length(eField)]))
          }
        }, 1, 5, q.position)
      }
      //console.timeEnd("E field calc")
      if(this.render){ cleanStandard(gl,this.render) }
      this.render = bufferMany(gl,vecs,gl.LINES)
    }}
  })

  const ionRenderModel = bufferSphere(gl,[0,0,0],0.35,3,3,(theta,phi) => [1,0,0,1])

  cartDist((x,y,z) => {
    gameState.viewports[1].objects["lattice" + x + "" + y + "" + z] = {
      render: ionRenderModel,
      located: [x,y,z],
      charged: 1
    }
  },1/15,30,[0,0,0])

  // Draw the scene repeatedly
  function render(now) {
    let dT = now - gameState.gameTime
    document.querySelector("#dT").innerHTML = "" + dT
    gameState.viewports[gameState.activeViewer].viewer = respondToViewChanges(gameState.viewports[gameState.activeViewer].viewer,dT)

    const curView = gameState.viewports[gameState.activeViewer].viewer

    localStorage.setItem("viewRadius",curView.radius)
    localStorage.setItem("viewTheta",curView.theta)
    localStorage.setItem("viewPhi",curView.phi)
    
    let skips = gameState.viewIndex
    const viewableObjects = gameState.viewports[gameState.activeViewer].objects
    for(let k in viewableObjects){
      if(viewableObjects[k].located){
        skips--
        if(skips == 0){
          gameState.viewports[gameState.activeViewer].viewer.origin = viewableObjects[k].located
          break
        }
      }
    }

    gameState.gameTime = now

    // Temporarily static while we work on viewports
    /*
    for(let k in objects){
      if(objects[k].dynamics){
        objects[k].dynamics(dT,objects)
      }
    }
    */

    //snapshotObjects = objects

    // Clear once for all viewports
    gl.clearColor(0.5,0.5,0.5,1)
    gl.clearDepth(1)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    gameState.viewports.forEach(vp => {
      drawScene(gl, programInfo, vp);
    })
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

function electroDynamics(dT, objects){
  const eField = calcElectricFieldSigmaCharges(getChargeDist(objects),this.located)
  let dp = [0,0,0]
  vec3.scale(dp,eField,this.charged * dT)
  vec3.add(this.kinematics.momentum,this.kinematics.momentum,dp)
  const speedLimit = 100
  if(vec3.length(this.kinematics.momentum) > speedLimit){
    vec3.scale(this.kinematics.momentum,this.kinematics.momentum,speedLimit / vec3.length(this.kinematics.momentum))
    console.warn("Limiting speed for " + this)
  }
  kinematics.call(this, dT)
}

function kinematics(dT){
  let dx = [0,0,0]
  vec3.scale(dx,this.kinematics.momentum,dT/this.kinematics.mass)
  vec3.add(this.located,this.located,dx)
}

function getChargeDist(objects){
  let charges = []
  for(let k in objects){
    let o = objects[k]
    if(o.located && o.charged){
      charges.push({position: o.located, charge: o.charged, boring: !o.dynamics})
    }
  }
  return charges
}

function calcElectricFieldSigmaCharges(charges,pos,k=1){
  let vec = [0,0,0]
  charges.forEach(c => {
    const toPt = vec3.subtract([],pos,c.position)
    const rSq = toPt[0] ** 2 + toPt[1] ** 2 + toPt[2] ** 2
    if(rSq > 0){
      vec3.add(vec,vec,vec3.scale([],vec3.normalize([],toPt),k * c.charge/rSq))
    }
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

function cartDist(fc, density, scale, center, basis){
  if(!basis){
    basis = []
    identityMatrix.forEach(v => basis.push(vec3.clone(v)))
  }
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

function cartToPolar2(x,y){
  return [Math.sqrt(x*x + y*y), Math.atan2(y,x)]
}

function cartToPolar(x,y,z){
  return [Math.sqrt(x*x + y*y + z*z), Math.atan2(Math.sqrt(x*x + y*y),z), Math.atan2(y,x)]
}

function polarToCart2(r,phi){
  return [r * Math.cos(phi), r * Math.sin(phi)]
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

function drawScene(gl, programInfo, vp){
  resize(gl.canvas)
  gl.viewport(vp.x * gl.canvas.width, vp.y * gl.canvas.height, vp.w * gl.canvas.width, vp.h * gl.canvas.height);

  const projectionMatrix = mat4.create()

  mat4.perspective(projectionMatrix, Math.PI * 0.4, (vp.w / vp.h) * gl.canvas.clientWidth/gl.canvas.clientHeight, 0.1, 1000.0)

  const viewMatrix = mat4.create()
  mat4.lookAt(viewMatrix,vec3.add([],vp.viewer.origin,polarToCart(vp.viewer.radius,vp.viewer.theta,vp.viewer.phi)),vp.viewer.origin,[0,0,1])

  gl.useProgram(programInfo.program)

  // No transpose
  gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, projectionMatrix)

  for(let k in vp.objects){
    let ro = vp.objects[k].render
    if(!ro){continue}
    const modelMatrix = mat4.create()
    mat4.multiply(modelMatrix,viewMatrix,modelMatrix)
    if(vp.objects[k].located){
      mat4.translate(modelMatrix,modelMatrix,vp.objects[k].located)
    }else if(!unlocatedObjects.includes(k)){
      unlocatedObjects.push(k)
      console.warn("Rendering unlocated object " + k)
    }

    gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, modelMatrix)
    gl.bindBuffer(gl.ARRAY_BUFFER, ro.position)
    // no normalize, 0 stride, 0 offset
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0)
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition)

    gl.bindBuffer(gl.ARRAY_BUFFER, ro.color)
    // no normalize, 0 stride, 0 offset
    gl.vertexAttribPointer(programInfo.attribLocations.vertexColor, 4, gl.FLOAT, false, 0, 0)
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexColor)

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ro.indices);
    // 0 offset
    gl.drawElements(ro.drawStyle, ro.indexCount, gl.UNSIGNED_SHORT, 0);
  }

}

// Sample a parametrized curve with color gradient
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

// Non-broken javascript modulus operator
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

function bufferBasis(gl){
  let vecs = []
  identityMatrix.forEach(v => {
    let c = [v[0],v[1],v[2],1]
    vecs.push(buildVector([0,0,0],v,c))
  })
  return bufferMany(gl,vecs,gl.LINES)
}

// Returns a colored line starting at the given point and with the given offset
function buildVector(center,vector,plusColor = [1,1,0,1],minusColor = [0.25,0.25,0.25,1]){
  minusColor[3] = plusColor[3] // Inherit alpha from plusColor
  return {positions: [center,vec3.add([],center,vector)].flat(), colors: [minusColor,plusColor].flat(), indices: [0,1]}
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

// Makes a render model out of the given positions, colors, indices
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
    indexCount: cnt
  };
}

function bufferSphere(gl,center,radius,segstheta,segsphi,fc) {
  return bufferStandard(gl,approxSphere(center,radius,segstheta,segsphi,fc),gl.TRIANGLES)
}

function bufferCurve(gl,fp,fc,segs) {
  return bufferStandard(gl,approxCurve(fp,fc,segs),gl.LINE_STRIP)
}

// Initialize a shader program, so WebGL knows how to draw our data
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

// Create a GL shader object from the source
function loadShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function resize(canvas) {
  // Lookup the size the browser is displaying the canvas.
  var displayWidth  = canvas.clientWidth;
  var displayHeight = canvas.clientHeight;

  // Check if the canvas is not the same size.
  if (canvas.width  !== displayWidth || canvas.height !== displayHeight) {
    // Make the canvas the same size
    canvas.width  = displayWidth;
    canvas.height = displayHeight;
  }
}
