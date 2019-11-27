window.onload = main;

// ECS explanation:
// Typical object is
//
// {"render": {...}, "charged": +1, "dynamics": function(dT,objects){...}, "located": [x,y,z]}

snapshotObjects = {}

unlocatedObjects = []

const identityMatrix = [[1,0,0],[0,1,0],[0,0,1]]

function wrapTo(theta,wrapAmount){
  if(theta > wrapAmount)
    return theta - wrapAmount
  if(theta < 0)
    return theta + wrapAmount
  return theta
}

function unitTestAtlas(atlas,pts,epsilon = 0.0000000001){
  for(let i = 0; i < atlas.length; i++){
    for(let j = 0; j < atlas.length; j++){ 
      const transformed = atlas[i].transition[j](atlas[j].transition[i](pts[j]))
      let diff = []
      let uhoh = false
      for(let k = 0; k < transformed.length; k++){
        diff[k] = transformed[k] - pts[j][k]
        if(Math.abs(diff[k]) > epsilon){
          uhoh = true
        }
      }
      if(uhoh){
        console.log(pts[j] + " (Original in " + j + ")")
        console.log(transformed + " (After roundtrip to " + i + ")")
        console.log("\t\t\t\tDifference: " + diff)
      }
    }
  }
}

function inChartDomain(chart,pt){
  for(let i = 0; i < pt.length; i++){
    if(pt[i] > chart.max[i] || pt[i] < chart.min[i]){
      return false
    }
  }
  return true
}

function atlasSweep(atlas,pt,chartNum){
  let out = []
  for(let i = 0; i < atlas.length; i++){
    const ptPrime = atlas[chartNum].transition[i](pt)
    if(inChartDomain(atlas[i],ptPrime)){
      out[i] = ptPrime
    }else{
      out[i] = undefined
    }
  }
  return out
}

function swapAxisSide([r,t]){
  return [r,wrapTo(t + Math.PI, 2 * Math.PI)]
}

// atlas[i].transition[j] is a map from the chart i to the chart j

polarAtlas = [
  // Chart with theta = 0 on plus x-axis
  {min: [0,0], max: [Infinity, 2 * Math.PI], transition: [a => a, ([r,t]) => [r,wrapTo(t + Math.PI,2 * Math.PI)],([r,t]) => polarToCart2(r,t)]},
  // Chart with theta = 0 on minus x-axis
  {min: [0,0], max: [Infinity, 2 * Math.PI], transition: [([r,t]) => [r,wrapTo(t + Math.PI, 2 * Math.PI)],a => a,([r,t]) => polarToCart2(r,wrapTo(t + Math.PI,2 * Math.PI))]},
  // Cartesian chart near origin +-1
  {min: [-1,-1], max: [1,1], transition: [([x,y]) => cartToPolar2(x,y), ([x,y]) => {let [r,t] = cartToPolar2(x,y); return [r,wrapTo(t + Math.PI, 2 * Math.PI)] }, a => a]}
]


// TODO!!! Spherical coordinate charts :D
/*
sphereAtlas = [
  // Chart with slice out of x poles (using +z)
  {min: [0,0,0], max: [Infinity, Math.PI, 2 * Math.PI], transition: [a => a,([r,t,p]) => [r,changeBasepoint(wrapTwoPi(phi + Math.PI/2)),],([r,t,p]) => polarToCart2(r,wrapTwoPi(t + Math.PI))]},
  // Chart with slice out of z poles (using -x)
  {min: [0,0,0], max: [Infinity, Math.PI, 2 * Math.PI], transition: [([r,t]) => [r,wrapTwoPi(t + Math.PI)],a => a,([r,t]) => polarToCart2(r,wrapTwoPi(t + Math.PI))]},
  // Cartesian chart near origin +-1
  {min: [-1,-1], max: [1,1], transition: [([x,y]) => cartToPolar2(x,y), ([x,y]) => {let [r,t] = cartToPolar2(x,y); return [r,wrapTwoPi(t + Math.PI)] }, a => a]}
]

function changeBasepoint(phi){
  if(phi > Math.PI){
    return (2 * Math.PI) - phi
  }
  return phi
}
*/

gameState = {
  viewOrigin: [0,0,0],
  viewRadius: 15,
  viewTheta: Math.PI/2,
  viewPhi: Math.PI,
  viewIndex: 0,
  dObject: 0,
  dRad: 0,
  dPhi: 0,
  dTheta: 0,
  gameTime: 0
}

if(localStorage.getItem("viewRadius")){
  gameState.viewRadius = parseFloat(localStorage.getItem("viewRadius"))
  gameState.viewTheta = parseFloat(localStorage.getItem("viewTheta"))
  gameState.viewPhi = parseFloat(localStorage.getItem("viewPhi"))
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

    const tinyElectron = {
      located: [2,0,2],
      charged: -0.5,
      render: bufferSphere(gl,[0,0,0],0.1,8,8,(theta,phi) => [1-Math.sin(theta),0,1,1]),
      dynamics: electroDynamics,
      kinematics: {momentum: [0,10,0], mass: 1000}
    }

  let objects = {
    "zaxis": {render: bufferCurve(gl,t => [0, 0, 50 * t - 25], t => [0, 0, 1 - Math.sin(t * Math.PI), 1], 3)}, // z axis
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
  }

  const ionRenderModel = bufferSphere(gl,[0,0,0],0.35,3,3,(theta,phi) => [1,0,0,1])

  cartDist((x,y,z) => {
    objects["lattice" + x + "" + y + "" + z] = {
      render: ionRenderModel,
      located: [x,y,z],
      charged: 1
    }
  },1/15,30,[0,0,0])

  // Draw the scene repeatedly
  function render(now) {
    let dT = now - gameState.gameTime
    document.querySelector("#dT").innerHTML = "" + dT

    gameState.viewRadius += dT * gameState.dRad
    gameState.viewRadius = Math.max(0.001,gameState.viewRadius)
    gameState.viewPhi += dT * gameState.dPhi * 0.2
    gameState.viewTheta += dT * gameState.dTheta * 0.2
    gameState.viewTheta = Math.min(Math.PI,Math.max(0.001,gameState.viewTheta))
    if(gameState.viewPhi > 2 * Math.PI)
      gameState.viewPhi -= 2 * Math.PI
    if(gameState.viewPhi < 0)
      gameState.viewPhi += 2 * Math.PI

    localStorage.setItem("viewRadius",gameState.viewRadius)
    localStorage.setItem("viewTheta",gameState.viewTheta)
    localStorage.setItem("viewPhi",gameState.viewPhi)
    
    let skips = gameState.viewIndex
    for(let k in objects){
      if(objects[k].located){
        skips--
        if(skips == 0){
          gameState.viewOrigin = objects[k].located
          break
        }
      }
    }

    gameState.gameTime = now

    for(let k in objects){
      if(objects[k].dynamics){
        objects[k].dynamics(dT,objects)
      }
    }

    snapshotObjects = objects

    drawScene(gl, programInfo, objects, now);
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

function drawScene(gl, programInfo, objects, now){
  resize(gl.canvas)
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  gl.clearColor(0.5,0.5,0.5,1)
  gl.clearDepth(1)
  gl.enable(gl.DEPTH_TEST)
  gl.depthFunc(gl.LEQUAL)

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

  const projectionMatrix = mat4.create()

  mat4.perspective(projectionMatrix, Math.PI * 0.4, gl.canvas.clientWidth/gl.canvas.clientHeight, 0.1, 1000.0)

  const viewMatrix = mat4.create()
  mat4.lookAt(viewMatrix,vec3.add([],gameState.viewOrigin,polarToCart(gameState.viewRadius,gameState.viewTheta,gameState.viewPhi)),gameState.viewOrigin,[0,0,1])

  gl.useProgram(programInfo.program)

  // No transpose
  gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, projectionMatrix)

  for(let k in objects){
    let ro = objects[k].render
    if(!ro){continue}
    const modelMatrix = mat4.create()
    mat4.multiply(modelMatrix,viewMatrix,modelMatrix)
    if(objects[k].located){
      mat4.translate(modelMatrix,modelMatrix,objects[k].located)
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
    indexCount: cnt
  };
}

// Makes the object p render as q
function disguiseAs(p,q){
  p.render = q.render
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

function resize(canvas) {
  // Lookup the size the browser is displaying the canvas.
  var displayWidth  = canvas.clientWidth;
  var displayHeight = canvas.clientHeight;

  // Check if the canvas is not the same size.
  if (canvas.width  !== displayWidth ||
      canvas.height !== displayHeight) {

    // Make the canvas the same size
    canvas.width  = displayWidth;
    canvas.height = displayHeight;
  }
}
