window.onload = main;

// Typical viewer state is
const typicalViewer = {origin: [0,0,0], radius: 15, theta: Math.PI/4, phi: Math.PI * 1.25}

/*if(localStorage.getItem("viewRadius")){
  typicalViewer.radius = parseFloat(localStorage.getItem("viewRadius"))
  typicalViewer.theta = parseFloat(localStorage.getItem("viewTheta"))
  typicalViewer.phi = parseFloat(localStorage.getItem("viewPhi"))
}*/

snapshotObjects = {}

unlocatedObjects = []

const identityMatrix = [[1,0,0],[0,1,0],[0,0,1]]

const compressionTensor = {shape: [4,3,4], data: 
  [1,0,0,0, 0,1,0,0, 0,0,1,0
  ,0,1,0,0, 0,0,1,0, 0,0,0,1
  ,0,0,1,0, 0,0,0,1, 1,0,0,0
  ,0,0,0,1, 1,0,0,0, 0,1,0,0]
}
const compressionMatrix = [
   [[1,0,0,0],[0,1,0,0],[0,0,1,0]]
  ,[[0,1,0,0],[0,0,1,0],[0,0,0,1]]
  ,[[0,0,1,0],[0,0,0,1],[1,0,0,0]]
  ,[[0,0,0,1],[1,0,0,0],[0,1,0,0]]]

const labelMatrix = [[0,1,2],[1,2,3],[2,3,0],[3,0,1]]

const lorentzLabels = ["t","r","\u03B8","\u03D5"]

gameState = {
  viewIndex: 0,
  activeViewer: 0,
  dObject: 0,
  dRad: 0,
  dPhi: 0,
  dTheta: 0,
  gameTime: 0,
  nowEvent: [0,1,0,0],
  doShowInstructions: true,
  objects: {},
  viewports: [
    {x: 0.0,y: 0.0,w: 0.5,h: 0.5, viewer: Object.assign({},typicalViewer), objects: {}},
    {x: 0.5,y: 0.0,w: 0.5,h: 0.5, viewer: Object.assign({},typicalViewer), objects: {}},
    {x: 0.0,y: 0.5,w: 0.5,h: 0.5, viewer: Object.assign({},typicalViewer), objects: {}},
    {x: 0.5,y: 0.5,w: 0.5,h: 0.5, viewer: Object.assign({},typicalViewer), objects: {}}
  ]
}

function respondToViewChanges(viewer, dT){
  viewer.radius += dT * gameState.dRad
  viewer.radius = Math.max(0.11,viewer.radius)
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
  if(evt.keyCode == 84){ gameState.activeViewer = modul(gameState.activeViewer + 1, gameState.viewports.length) } // T
  if(evt.keyCode == 66){ gameState.activeViewer = modul(gameState.activeViewer - 1, gameState.viewports.length) } // B
  if(evt.keyCode == 82){ gameState.viewports.forEach((_,i) => Object.assign(gameState.viewports[i].viewer,typicalViewer)) } // R
  if(evt.keyCode == 73){ gameState.objects["lightCone"].hidden = !gameState.objects["lightCone"].hidden } // I
  if(evt.keyCode == 27){ gameState.doShowInstructions = !gameState.doShowInstructions } // ESC
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
  const gl = document.getElementById("glCanvas").getContext("webgl")
  if (gl===null) {alert("No WebGL :(")}

  // Vertex shader program
  const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec4 aVertexColor;
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    varying highp vec4 vColor;
    void main(void) {
      gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
      gl_PointSize = 10.0;
      vColor = aVertexColor;
    }
  `;

  // Fragment shader program
  const fsSource = `
    varying highp vec4 vColor;
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

  gameState.objects["fourvelocity"] = {compress: compressVector}
  gameState.objects["lightCone"] = {compress: compressMetric}
  gameState.objects["kartoffelSymbols"] = {compress: compressKartoffel}

  gameState.viewports.forEach(vp => {vp.objects["basis"] = {located: [0,0,0], render: bufferBasis(gl), dirty: true}})

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

    // Indexes into our phase space we display
    var lambda = now * 0.001

    // Set coordinates:
    // This is an oscillator in r with the given position and velocity; max velocity 0.25c
    gameState.nowEvent[1] = 0.5 + 0.25 * Math.sin(lambda)
    var dr = 0.25 * Math.cos(lambda)

    // On equator ish
    gameState.nowEvent[2] = Math.PI / 2 + 0.1 * Math.cos(3 * lambda)
    var dtheta = -0.1 * 3 * Math.sin(3 * lambda)

    // Meanwhile, we are just going in a circle at a constant angular speed
    gameState.nowEvent[3] = 0.2 * lambda
    var dphi = 0.2

    var radius = gameState.nowEvent[1]
    var theta = gameState.nowEvent[2]
    const theMetric = sphereMetric(radius,theta)
    // In the object's rest frame at an event, we should have norm of this is g_{tt} v^t v^t = mass
    gameState.objects["fourvelocity"].data = {shape: [4], data: [Math.sqrt(1 - dr * dr * theMetric[1][1] - dtheta * dtheta * theMetric[2][2] - dphi * dphi * theMetric[3][3]),dr,dtheta,dphi]}
    gameState.objects["fourvelocity"].dirty = true

    gameState.objects["lightCone"].data = theMetric
    gameState.objects["lightCone"].dirty = true

    //gameState.objects["kartoffelSymbols"].data = polarCurvature(radius)
    //gameState.objects["kartoffelSymbols"].dirty = true

    // Text canvas stuff
    const textCanvas = document.getElementById("textCanvas")
    resize(textCanvas)
    var txtctx = textCanvas.getContext("2d")
    txtctx.clearRect(0,0,txtctx.canvas.width,txtctx.canvas.height)
    const textHeight = 48
    txtctx.font = textHeight + "px Georgia"
    const mainGradient = txtctx.createLinearGradient(0,0,txtctx.canvas.width,txtctx.canvas.height)
    mainGradient.addColorStop(0,"#2E3532")
    mainGradient.addColorStop(0.5,"#89023E")
    mainGradient.addColorStop(1,"#587B7F")


    txtctx.lineWidth = 2

    for(var j = 0; j < 4; j++){
      for(let k in gameState.objects){
        if(!gameState.objects[k].dirty){ continue }
        if(!gameState.objects[k].hidden){
          gameState.viewports[j].objects[k] = gameState.objects[k].compress(gl,j,gameState.objects[k].data,gameState.viewports[j].objects[k])
        }
        gameState.viewports[j].objects[k].hidden = gameState.objects[k].hidden
      }
      txtctx.textBaseline = "top"
      txtctx.fillStyle = "black"
      txtctx.fillText("" + j,gameState.viewports[j].x * txtctx.canvas.width + 0.25 * textHeight,gameState.viewports[j].y * txtctx.canvas.height + 0.25 * textHeight)
      for(var l = 0; l < 3; l++){
        txtctx.textBaseline = "bottom"
        const brightness = 180
        txtctx.fillStyle = "rgb(" + brightness * identityMatrix[l][0] + "," + brightness * identityMatrix[l][1] + "," + brightness * identityMatrix[l][2] + ")"
        txtctx.fillText(lorentzLabels[labelMatrix[j][l]],gameState.viewports[j].x * txtctx.canvas.width + l * 1.5 * textHeight + 0.5 * textHeight,(0.5 + gameState.viewports[j].y) * txtctx.canvas.height - 0.5 * textHeight)
        txtctx.font = (textHeight/2) + "px Georgia"
        txtctx.fillText(fourProject(compressionMatrix[j],gameState.nowEvent)[l].toFixed(2),gameState.viewports[j].x * txtctx.canvas.width + l * 1.5 * textHeight + 0.5 * textHeight,(0.5 + gameState.viewports[j].y) * txtctx.canvas.height - 1.5 * textHeight)
        txtctx.font = textHeight + "px Georgia"
      }
      txtctx.lineWidth = 2
      if(gameState.activeViewer == j){
        const activeGradient = txtctx.createLinearGradient(
          gameState.viewports[j].x * txtctx.canvas.width,
          gameState.viewports[j].y * txtctx.canvas.height + 0.5 * txtctx.canvas.height,
          gameState.viewports[j].x * txtctx.canvas.width + 0.5 * txtctx.canvas.width,
          gameState.viewports[j].y * txtctx.canvas.height
        )
        activeGradient.addColorStop(0,"#D3D0CB")
        activeGradient.addColorStop(1,"#E2C044")
        txtctx.strokeStyle = activeGradient
      }else{
        txtctx.strokeStyle = mainGradient
      }
      txtctx.strokeRect(
        gameState.viewports[j].x * txtctx.canvas.width + txtctx.lineWidth/2,
        gameState.viewports[j].y * txtctx.canvas.height + txtctx.lineWidth/2,
        0.5 * txtctx.canvas.width - txtctx.lineWidth,
        0.5 * txtctx.canvas.height - txtctx.lineWidth
      )
    }
    for(let k in gameState.objects){
      gameState.objects[k].dirty = false
    }

    if(gameState.doShowInstructions){
      txtctx.strokeStyle = mainGradient
      var paddingSize = 50
      txtctx.lineWidth = 8
      txtctx.fillStyle = "rgba(0,10,30,0.55)"
      txtctx.fillRect(paddingSize,paddingSize,txtctx.canvas.width - paddingSize * 2,txtctx.canvas.height - paddingSize * 2)
      txtctx.strokeRect(paddingSize,paddingSize,txtctx.canvas.width - paddingSize * 2,txtctx.canvas.height - paddingSize * 2)
      txtctx.textBaseline = "top"
      txtctx.fillStyle = "#5f6f6f"
      var textMargin = 20
      txtctx.fillText("Controls:",paddingSize + textMargin,paddingSize + textMargin)
      txtctx.fillText("Esc - Show/Hide Controls",paddingSize + textMargin,paddingSize + textMargin + 1.5 * textHeight)
      txtctx.fillText("I - Show/Hide Light Cones",paddingSize + textMargin,paddingSize + textMargin + 3 * textHeight)
      txtctx.fillText("HJKL - Rotate view",paddingSize + textMargin,paddingSize + textMargin + 4.5 * textHeight)
      txtctx.fillText("QZ - Zoom In/Out",paddingSize + textMargin,paddingSize + textMargin + 6.0 * textHeight)
      txtctx.fillText("TB - Change Viewport",paddingSize + textMargin,paddingSize + textMargin + 7.5 * textHeight)
      txtctx.fillText("EC - Change Focused Object",paddingSize + textMargin,paddingSize + textMargin + 9.0 * textHeight)
      txtctx.fillStyle = "#787b4f"
      txtctx.fillText("The yellow vectors are the projections of a four velocity with spatial part given by:",paddingSize + textMargin,paddingSize + textMargin + 11.5 * textHeight)
      txtctx.fillText("<2\u00B7cos(\u03BB),2\u00B7sin(\u03BB),0.5\u00B7cos(0.5\u03BB)>",paddingSize + textMargin,paddingSize + textMargin + 13 * textHeight)
      txtctx.fillText("for various \u03BB in [0,2\u03C0]",paddingSize + textMargin,paddingSize + textMargin + 14.5 * textHeight)
 
    }

    // Clear once for all viewports
    gl.clearColor(0.5,0.5,0.5,1)
    //gl.clearDepth(1)
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

function polarToCart(r,theta,phi){
  return [r * Math.cos(phi) * Math.sin(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(theta)]
}


function drawSingleObject(gl, programInfo, viewMatrix, vpObj){
  let ro = vpObj.render
  if(!ro || vpObj.hidden){return}
  const modelMatrix = mat4.create()
  if(vpObj.located){
    if(vpObj.scaled){
      var s = vpObj.scaled
      mat4.scale(modelMatrix, modelMatrix, [s,s,s])
    }
    if(vpObj.oriented){
      let quatMat = mat4.create()
      mat4.fromRotationTranslation(quatMat,vpObj.oriented, [0,0,0])
      mat4.multiply(modelMatrix, quatMat, modelMatrix)
    }
    mat4.translate(modelMatrix,modelMatrix,vpObj.located)
    if(vpObj.arbitrary){
      const arb = mat4.fromValues(vpObj.arbitrary[0][0],vpObj.arbitrary[1][0],vpObj.arbitrary[2][0],0
        ,vpObj.arbitrary[0][1],vpObj.arbitrary[1][1],vpObj.arbitrary[2][1],0
        ,vpObj.arbitrary[0][2],vpObj.arbitrary[1][2],vpObj.arbitrary[2][2],0
        ,0,0,0,1)
      mat4.multiply(modelMatrix, modelMatrix, arb)
    }
  }else if(!unlocatedObjects.includes(vpObj)){
    unlocatedObjects.push(vpObj)
    console.warn("Rendering unlocated object " + vpObj)
  }
  mat4.multiply(modelMatrix,viewMatrix,modelMatrix)

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

function drawScene(gl, programInfo, vp){
  resize(gl.canvas)
  gl.viewport(vp.x * gl.canvas.width, (0.5 - vp.y) * gl.canvas.height, vp.w * gl.canvas.width, vp.h * gl.canvas.height);

  const projectionMatrix = mat4.create()

  mat4.perspective(projectionMatrix, Math.PI * 0.2, (vp.w / vp.h) * gl.canvas.clientWidth/gl.canvas.clientHeight, 0.1, 1000.0)

  const viewMatrix = mat4.create()
  mat4.lookAt(viewMatrix,vec3.add([],vp.viewer.origin,polarToCart(vp.viewer.radius,vp.viewer.theta,vp.viewer.phi)),vp.viewer.origin,[0,0,1])

  gl.useProgram(programInfo.program)

  // No transpose
  gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, projectionMatrix)

  for(let k in vp.objects){
    if(Array.isArray(vp.objects[k])){
      vp.objects[k].forEach(o => drawSingleObject(gl, programInfo, viewMatrix, o))
    }else{
      drawSingleObject(gl, programInfo, viewMatrix, vp.objects[k])
    }
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

function bufferDoubleCone(gl,tip,baseRadius,baseX,baseY,sampsTheta,fc){
  var forwards = approxCone(tip,baseRadius,baseX,baseY,sampsTheta,fc)
  var backward = approxCone(tip,baseRadius,baseY,baseX,sampsTheta,fc)
  return bufferMany(gl,[forwards,backward],gl.TRIANGLES)
}

function approxCone(tip,baseRadius,baseX,baseY,sampsTheta,fc){
  // Circle samples, plus the tip point
  let numPoints = sampsTheta + 1
  let positions = new Float32Array(3 * numPoints)
  let colors = new Float32Array(4 * numPoints)
  let indices = new Uint16Array(3 * sampsTheta)
  let upwards = [0,0,0]
  vec3.cross(upwards,baseX,baseY)
  vec3.normalize(upwards,upwards)
  positions[0] = tip[0]
  positions[1] = tip[1]
  positions[2] = tip[2]
  colors[3] = 1
  for(let i=0; i < sampsTheta; i++){
    const theta = 2 * Math.PI * i/sampsTheta
    positions[3 * (1 + i) + 0] = baseX[0] * Math.cos(theta) * baseRadius + baseY[0] * Math.sin(theta) * baseRadius + upwards[0] * baseRadius
    positions[3 * (1 + i) + 1] = baseX[1] * Math.cos(theta) * baseRadius + baseY[1] * Math.sin(theta) * baseRadius + upwards[1] * baseRadius
    positions[3 * (1 + i) + 2] = baseX[2] * Math.cos(theta) * baseRadius + baseY[2] * Math.sin(theta) * baseRadius + upwards[2] * baseRadius

    for(let k=0; k < 4; k++){
      colors[4 * (1 + i) + k] = fc(theta)[k]
    }

    indices[3 * i + 0] = 0
    indices[3 * i + 1] = 1 + modul(1 + i,sampsTheta)
    indices[3 * i + 2] = 1 + i
  }
  return {positions: positions, colors: colors, indices: indices}
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

function bufferBasis(gl, deformedBasis = identityMatrix, alphaScale = 1){
  let vecs = []
  deformedBasis.forEach((v,i) => {
    let c = [identityMatrix[i][0],identityMatrix[i][1],identityMatrix[i][2],alphaScale]
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
  var indexCount = 0
  var positionBuffer = new Float32Array(os.map(o => o.positions.length).reduce((a,b) => a+b))
  var colorBuffer = new Float32Array(os.map(o => o.colors.length).reduce((a,b) => a+b))
  var indexBuffer = new Uint16Array(os.map(o => o.indices.length).reduce((a,b) => a+b))
  for(i = 0; i < os.length; i++){
    os[i].indices = os[i].indices.map(k => offset + k)
    positionBuffer.set(os[i].positions,offset * 3)
    colorBuffer.set(os[i].colors,offset * 4)
    indexBuffer.set(os[i].indices,indexCount)
    indexCount += os[i].indices.length
    offset += os[i].positions.length / 3
  }
  return bufferStandard(gl,{positions: positionBuffer, colors: colorBuffer, indices: indexBuffer},ds)
}

function cleanRenderModel(gl,rm){
  if(rm && rm.render){
    cleanStandard(gl,rm.render)
  }
}
function cleanStandard(gl,o){
  gl.deleteBuffer(o.position)
  gl.deleteBuffer(o.color)
  gl.deleteBuffer(o.indices)
}

// Makes a render model out of the given positions, colors, indices
function bufferStandard(gl,o,ds,cnt = o.indices.length){
  console.log("Buffering object with index count = " + cnt)
  const mkBuffer = (arrayType,arrayData) => {
    const theBuffer = gl.createBuffer();
    gl.bindBuffer(arrayType, theBuffer);
    gl.bufferData(arrayType, arrayData, gl.STATIC_DRAW)
    return theBuffer
  }
  return {
    position: mkBuffer(gl.ARRAY_BUFFER,new Float32Array(o.positions)),
    color: mkBuffer(gl.ARRAY_BUFFER,new Float32Array(o.colors)),
    indices: mkBuffer(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(o.indices)),
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

function contract(a,b,contractIndexA,contractIndexB){
  if(a.shape[contractIndexA] != b.shape[contractIndexB]) { console.warn("dimension mismatch!") }
  const doReshape = (as,bs) => as.slice(0,contractIndexA).concat(as.slice(contractIndexA+1)).concat(bs.slice(0,contractIndexB).concat(bs.slice(contractIndexB+1)))
  const outShape = doReshape(a.shape,b.shape)
  //console.log(outShape)
  const outSize = outShape.reduce((a,b) => a * Math.abs(b))
  const contractSize = a.shape[contractIndexA]
  const leftContractStride = shapeValues(a.shape)[contractIndexA]
  const rightContractStride = shapeValues(b.shape)[contractIndexB]
  var out = new Float32Array(outSize)
  for(var pt = 0; pt < outSize; pt++){
    var ixs = shapedUnIndex(outShape,pt)
    var ixsL = ixs.slice(0,a.shape.length - 1)
    var ixsR = ixs.slice(a.shape.length - 1)
    ixsL.splice(contractIndexA,0,0)
    ixsR.splice(contractIndexB,0,0)
    //console.log(ixs)
    const startIxL = shapedIndex(a.shape,ixsL)
    const startIxR = shapedIndex(b.shape,ixsR)
    //console.log("strides")
    //console.log(ixsL)
    //console.log(startIxL)
    //console.log(leftContractStride)
    //console.log(ixsR)
    //console.log(startIxR)
    //console.log(rightContractStride)
    for(var j = 0; j < contractSize; j++){
      out[pt] += a.data[startIxL + j * leftContractStride] * b.data[startIxR + j * rightContractStride]
    }
  }
  return {shape: outShape, data: out}
}

function shapedFourProject(c,shape,v){
  if(!shape.every(x => Math.abs(x) == 4)){
    console.warn("shaped four project of non-4d object!")
  }
  var out = []
  return v
}

/*
function shapeLoop(shape){
  const size = shape.reduce((a,b) => a * Math.abs(b))
  const vals = shapeValues(shape)
  var out = []
  for(var i = 0; i < size; i++){
    out[i] = vals.map(x => modul(i,x))
  }
  return out
}*/


// Takes a 3x4 matrix (3-array of 4-arrays) and a spacetime tensor, projects the tensor using the matrix
function fourProject(c,fv){
  //console.count("fourProject called")
  if(Array.isArray(fv)){
    var x0 = fourProject(c,fv[0])
    var x1 = fourProject(c,fv[1])
    var x2 = fourProject(c,fv[2])
    var x3 = fourProject(c,fv[3])

    var out = [
       [arbScale(x0,c[0][0]), arbScale(x1,c[0][1]), arbScale(x2,c[0][2]), arbScale(x3,c[0][3])].reduce(arbSum)
      ,[arbScale(x0,c[1][0]), arbScale(x1,c[1][1]), arbScale(x2,c[1][2]), arbScale(x3,c[1][3])].reduce(arbSum)
      ,[arbScale(x0,c[2][0]), arbScale(x1,c[2][1]), arbScale(x2,c[2][2]), arbScale(x3,c[2][3])].reduce(arbSum)]
    return out
  }
  return fv
}

function arbSum(a,b){
  if(Array.isArray(a)){
    var out = []
    a.forEach((xa,i) => out.push(arbSum(xa, b[i])))
    return out
  }
  return a + b
}

function arbScale(x,lambda){
  if(Array.isArray(x)){
    var out = []
    x.forEach(n => out.push(arbScale(n,lambda)))
    return out
  }
  return lambda * x
}

const zeroCurves = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]
const emptyCurvature = [zeroCurves,zeroCurves,zeroCurves,zeroCurves]

function diagMetric(t,x,y,z){
  return [[t,0,0,0],[0,x,0,0],[0,0,y,0],[0,0,0,z]]
}

function insideOutPolarMetric(radius){
    return arbScale(polarMetric(radius),-1)
}
// t r phi z metric at given radius
function polarMetric(radius){
    return diagMetric(-1,1,radius * radius,1)
}

function polarCurvature(radius){
  // t, r, phi, z
  // With Gamma^phi_{phi r} = 1/r and Gamma^r_{phi phi} = -r and all else zero
  const a = 1/radius
  const b = -radius
  return [
    zeroCurves // t
    ,[[0,0,0,0],[0,0,0,0],[0,0,a,0],[0,0,0,0]] // r
    ,[[0,0,0,0],[0,0,a,0],[0,b,0,0],[0,0,0,0]] // phi
    ,zeroCurves // z
    ]
}

// t r theta phi
function sphereMetric(radius,theta){
  return diagMetric(-1,1,radius * radius, radius * radius * Math.sin(theta) * Math.sin(theta))
}

function shapeValues(shape){
  var out = []
  for(var i = 0; i < shape.length - 1; i++){
    out[i] = shape.slice(i+1).reduce((a,b) => a * Math.abs(b))
  }
  out[shape.length-1] = 1
  return out
}

function shapedIndex(shape, ixs){
  for(var i = 0; i < shape.length - 1; i++){
    ixs[i] = ixs[i] * shape.slice(i+1).reduce((a,b) => a * Math.abs(b))
  }
  return ixs.reduce((a,b) => a + b)
}

function shapedUnIndex(shape, ix){
  const vals = shapeValues(shape)
  var out = []
  vals.forEach((v,i) => {
    out[i] = Math.floor(ix/v)
    ix = modul(ix,v) 
  })
  return out
}

function contigSubArray(t, prefix){
  const dropSize = prefix.length
  const outShape = t.shape.slice(dropSize) 
  // Pad the prefix up to the length of the shape
  prefix.length = t.shape.length
  prefix.fill(0,dropSize)
  const startIx = shapedIndex(t.shape,prefix)
  const outSize = outShape.reduce((a,b) => a * Math.abs(b))
  return {shape: outShape, data: t.data.slice(startIx, startIx + outSize)}
}

// T^\alpha_{ijk} with vector values:
// {compressValue: [i,j,k] => data.get(i,j,k,alpha) for alpha in 0 to 2 for the vector components, data: packed array here, shape: [4,-4,-4,-4], valueShape: [0,-4,-4,-4]}
//
// Input tensor should have shape [-4,-4,-4,x...] where the -4's are spacetime covariant indexes, and the x... is further compressable by a provided function
// tensor = {compressValue: (gl,c,value,oldRenderModel) => { ... }, indexCount: q, valueShape: [x...], shape: [...], data: [...]}
function compressTensor(gl,c,tensor,oldRenderModel){
  var go = ixCnt => {
    if(ixCnt == 0){ return }
    //tensor.compressValue(gl,c,contigSubArray(tensor.shape,tensor.data),oldRenderModel[i])
    //oldRenderModel
    //go(ixCnt - 1)
  }
}

var differentialOffset = 0.2
// Christoffel symbols introduce curvature, making spheres into potatoes
function compressKartoffel(gl,c,kartoffelSymbols,oldRenderModel){
  if(!oldRenderModel || !oldRenderModel[0] || !oldRenderModel[0].render){
    console.log("Rebuffering kartoffel basis")
    oldRenderModel = [{},{},{}]
    oldRenderModel[0].render = bufferBasis(gl,identityMatrix,0.2)
    oldRenderModel[1].render = bufferBasis(gl,identityMatrix,0.2)
    oldRenderModel[2].render = bufferBasis(gl,identityMatrix,0.2)
  }

  var reducedKartoffel = fourProject(compressionMatrix[c],kartoffelSymbols)
  // kartoffelSymbols[i][j][k] = Gamma^k_{ij}
  identityMatrix.forEach((direction,j) => {
    var scaledDirection = vec3.create()
    vec3.scale(scaledDirection,direction,differentialOffset)
    var deformedBasis = [[],[],[]]
    identityMatrix.forEach((basisVec,i) => {
      var scaledSymb = vec3.create()
      vec3.scale(scaledSymb,reducedKartoffel[i][j],differentialOffset)
      vec3.add(deformedBasis[i],basisVec,scaledSymb)
    })
    oldRenderModel[j].located = scaledDirection
    oldRenderModel[j].arbitrary = deformedBasis
  })
  return oldRenderModel
}

// Show the light cone for a metric
function compressMetric(gl,c,metric,oldRenderModel){
  //if(oldRenderModel && oldRenderModel.located){ return oldRenderModel}
  if(!oldRenderModel){ oldRenderModel = {located: [0,0,0], metricStyle: "unknown"} }
  const reducedMetric = fourProject(compressionMatrix[c],metric)
  const eigen = math.eigs(reducedMetric)
  const sgn = eigen.values.filter(lambda => lambda < 0).length

  const parity = modul(sgn,2) == 1
  const colorScheme = parity ? [0,0.45,0.45,1] : [0.45,0,0,1]

  // Signature (---) or (+++) metric that we can't really show
  if(sgn == 3 || sgn == 0){
    //console.log("Got signature (+++) or (---) metric " + metric + " with projection " + reducedMetric)
    if(oldRenderModel.metricStyle != "point"){
      
      oldRenderModel.render = bufferSphere(gl,[0,0,0],0.1,8,8,(theta,phi) => colorScheme)
      oldRenderModel.metricStyle = "point"
    }
    return oldRenderModel
  }
  // This metric *looks* lorentzian (or skew-lorentzian) in this projection
  if(sgn == 1 || sgn == 2){
    // Eigenvalues are sorted, so it really is (-++) and not a permutation of this
    eigen.vectors = math.transpose(eigen.vectors)

    // Switch (--+) to (+--) to match (-++); the rest of this is invariant against an overall sign
    if(!parity){
      eigen.values = eigen.values.reverse().map(x => -x)
      // You might think this reversal could change the handedness of the cone!
      // But fear not, for time has no direction according to only a metric :o
      // We draw both cones regardless
      eigen.vectors = eigen.vectors.reverse()
    }

    var scaledX = []
    vec3.scale(scaledX,eigen.vectors[1],Math.sqrt(-eigen.values[0])/Math.sqrt(eigen.values[1]))
    var scaledY = []
    vec3.scale(scaledY,eigen.vectors[2],Math.sqrt(-eigen.values[0])/Math.sqrt(eigen.values[2]))
    if(oldRenderModel.metricStyle != "doubleCone"){
      // Buffer new double cone for the occasion
      cleanRenderModel(gl,oldRenderModel)
      oldRenderModel.render = bufferDoubleCone(gl,[0,0,0],2,[1,0,0],[0,1,0],15,x => colorScheme)
      oldRenderModel.metricStyle = "doubleCone"
    }

    let upwards = [0,0,0]
    vec3.cross(upwards,scaledX,scaledY)
    vec3.normalize(upwards,upwards)
    oldRenderModel.arbitrary = math.transpose([scaledX,scaledY,upwards])

    return oldRenderModel
    //return {render: bufferDoubleCone(gl,[0,0,0],2,scaledX,scaledY,15,x => [0,0.45,0.45,1]), located: [0,0,0], metricStyle: "doubleCone"}
  }
}

function compressVector(gl,c,fourVec,oldRenderModel){
  var v = contigSubArray(contract(compressionTensor,fourVec,2,0),[c]).data
  if(v == [0,0,0]){
    return {render: bufferStandard(gl,{positions: [0,0,0], colors: [1,1,0,1], indices: [0]},gl.POINTS), located: [0,0,0]}
  }
  if(!oldRenderModel || !oldRenderModel.oriented){
    oldRenderModel = {render: bufferStandard(gl,buildVector([0,0,0],[0,0,1],[1,1,0,1]),gl.LINES), located: [0,0,0]}
  }
  oldRenderModel.oriented = quat.create()
  oldRenderModel.scaled = vec3.length(v)
  vec3.normalize(v,v)
  quat.rotationTo(oldRenderModel.oriented,[0,0,1],v)
  return oldRenderModel
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
