//-------------------------------------------------------
// Global Variables
//-------------------------------------------------------
var g_effect;
var g_material;
var g_controls;
var g_geometry;
var g_rotation;
var g_currentBoost;
var g_tet_num = 0;
var g_currentWeight = 0.0;
var g_stereoBoosts = [];
// var g_cellBoost;
// var g_invCellBoost;
var g_screenResolution;
var g_screenShotResolution;
var g_controllerBoosts = [];
var g_controllerDualPoints = [];

var g_census_data;
var g_census_index;
var g_maxNumTet = 9;
var triangIntegerWeights = {};
var planes; 
var other_tet_nums; 
var entering_face_nums; 
var weights; 
var SO31tsfms; 
var tet_vertices;
var gradientThreshholds = [0.0, 0.25, 0.45, 0.75, 1.000001];
var gradientColours = [new THREE.Vector3(1.0, 1.0, 1.0),  // cool
                       new THREE.Vector3(0.86274, 0.92941, 0.78431), 
                       new THREE.Vector3(0.25882, 0.70196, 0.83529), 
                       new THREE.Vector3(0.10196, 0.13725, 0.49412), 
                       new THREE.Vector3(0.0, 0.0, 0.0)];
var g_triangulation;
var g_surfaceIndex;
var g_census = 0;

//-------------------------------------------------------
// Scene Variables
//-------------------------------------------------------
var scene;
var mesh;
var renderer;
var camera;
var maxSteps = Math.floor(Math.exp(4.6));
var maxDist = Math.exp(2.0);
var subpixelCount = 1; // calculate this^2 rays per pixel
var edgeThickness = 0.0;
// var textFPS;
var time;
var stats;

//-------------------------------------------------------
// FPS Manager
//-------------------------------------------------------
var m_stepDamping = 0.75;
var m_stepAccum = 0;
// var fpsLog = new Array(10);
// fpsLog.fill(g_targetFPS.value);

// json to threejs conversion

function array2vector4(v){
  return new THREE.Vector4().fromArray(v);
}
function array2matrix4(M){
  return new THREE.Matrix4().fromArray(M);
}

//-------------------------------------------------------
// Sets up the scene
//-------------------------------------------------------
var init = function(){
  if(WEBGL.isWebGL2Available() === false){
    document.body.appendChild(WEBGL.getWebGL2ErrorMessage());
  }
  else{    
    //Setup our THREE scene--------------------------------
	  time = Date.now();
	  // textFPS = document.getElementById('fps');
    scene = new THREE.Scene();
    var canvas  = document.createElement('canvas');
    var context = canvas.getContext('webgl2');
    renderer = new THREE.WebGLRenderer({canvas: canvas, context: context});
    document.body.appendChild(renderer.domElement);
    g_screenResolution = new THREE.Vector2(window.innerWidth, window.innerHeight);
    // g_screenShotResolution = new THREE.Vector2(12288,24576);  //12288,24576 //4096,4096 //window.innerWidth, window.innerHeight); 
    g_screenShotResolution = new THREE.Vector2(4096,4096);  
    g_effect = new THREE.VREffect(renderer);
    camera = new THREE.OrthographicCamera(-1,1,1,-1,1/Math.pow(2,53),1);
    g_controls = new THREE.Controls();
    g_rotation = new THREE.Quaternion();
    g_controllerBoosts.push(new THREE.Matrix4());
    g_controllerBoosts.push(new THREE.Matrix4());
    g_currentBoost = new THREE.Matrix4(); // boost for camera relative to tetrahedron

    // Nice initial position for cPcbbbiht_12
    // var temp = new THREE.Matrix4().makeRotationZ(Math.PI + Math.PI/3.0);
    // g_currentBoost.multiply(temp);

    // Nice initial position for gLLAQbecdfffhhnkqnc_120012:
    // var temp = parabolicBy2DVector(new THREE.Vector2(0.5,0)).premultiply(new THREE.Matrix4().makeRotationZ(Math.PI + Math.PI/3.5));
    // g_currentBoost.multiply(temp);

    // Nice initial position for gLMzQbcdefffhhhhhit_122112
    // var temp = parabolicBy2DVector(new THREE.Vector2(0.7649484590167701,0.12594832555674987));
    // g_currentBoost.multiply(temp);

    // We need to load the shaders from file
    // since web is async we need to wait on this to finish
    loadStuff();
  }
  stats = new Stats(); stats.showPanel(1); stats.showPanel(2); stats.showPanel(0); document.body.appendChild(stats.dom);
}

var globalsFrag;
var mainFrag;

var loadStuff = function(){
  g_census_data = [0,0,0,0]; // dummy place holders, will get replaced as we load them
  g_census_index = 0;
  ////// Default cusped
  g_triangulation = 'cPcbbbiht_12';
  // g_triangulation = 'gLLAQbecdfffhhnkqnc_120012';
  // g_triangulation = 'gLMzQbcdefffhhhhhit_122112';
  g_surfaceIndex = 0;

  // asynchronously load the non-default censuses
  var loader3 = new THREE.FileLoader();
    loader3.load('data/cannon_thurston_data_closed_374.json',function(data){
    g_census_data[1] = JSON.parse(data); // we only need the non-default census data when the user changes census in the UI
  });
  var loader4 = new THREE.FileLoader();
    loader4.load('data/cannon_thurston_data_cusped_cool_examples.json',function(data){
    g_census_data[2] = JSON.parse(data); 
  });
  var loader5 = new THREE.FileLoader();
    loader5.load('data/cannon_thurston_data_closed_cool_examples.json',function(data){
    g_census_data[3] = JSON.parse(data); 
  });
        
  // and asynchronously load the default census
  var loader2 = new THREE.FileLoader();
  loader2.load('data/cannon_thurston_data_cusped_374.json',function(data){
    g_census_data[0] = JSON.parse(data);    
    loadShaders();  // can only set up everything else once we have the default data loaded
    setUpTriangulationAndSurface(g_triangulation, g_surfaceIndex);
    //Setup dat GUI --- SceneManipulator.js
    initGui();
  });
} 

var setUpTriangulationAndSurface = function(triangulation, surfaceIndex){
  var triang_data = g_census_data[g_census_index][triangulation];
  triangIntegerWeights = {};
  for(i=0;i<triang_data.length;i++){
    triangIntegerWeights[triang_data[i][5].toString()] = i;
    //triangIntegerWeights.push(triang_data[i][5]);
  }

  var triang_surface_data = triang_data[surfaceIndex];  
  // console.log(triang_surface_data);
  /// set up a for loop to build planes array using array2vector4...
  planes = [];
  other_tet_nums = [];
  entering_face_nums = [];
  weights = [];
  SO31tsfms = [];
  
  var data_length = triang_surface_data[0].length;
  for(i=0;i<4*g_maxNumTet;i++){
    planes.push(array2vector4(triang_surface_data[0][i%data_length]));  // pad out the extra space in the array 
    other_tet_nums.push(triang_surface_data[1][i%data_length]);
    entering_face_nums.push(triang_surface_data[2][i%data_length]);
    weights.push(triang_surface_data[3][i%data_length]);
    SO31tsfms.push(array2matrix4(triang_surface_data[4][i%data_length]));
  }   
}

var loadShaders = function(){ //Since our shader is made up of strings we can construct it from parts
  var loader = new THREE.FileLoader();
  loader.setResponseType('text');
  loader.load('shaders/fragment.glsl',function(main){
      loader.load('shaders/globalsInclude.glsl', function(globals){
      //pass full shader string to finish our init
      globals = globals.replace(/##arrayLength##/g, (4*g_maxNumTet).toString()); //global replace all occurrences
      // Seems to cause performance issues when we reload the shader when changing the triangulation. 
      // Better to fix the shader array length once and for all, and pad the smaller triangulation arrays 
      // to make them stop complaining.
      globalsFrag = globals;
      // console.log(globals);
      mainFrag = main;
      finishInit(globals.concat(main));
    });
  });
  
}

var finishInit = function(fShader){
  g_material = new THREE.ShaderMaterial({
    uniforms:{
      screenResolution:{type:"v2", value:g_screenResolution},
      fov:{type:"f", value:90},
      liftsThickness:{type:"f", value:0.0},

      currentBoost:{type:"m4", value:g_currentBoost},
      tetNum:{type:"i", value:g_tet_num},
      currentWeight:{type:"f", value:0.0},

      maxSteps:{type:"i", value:maxSteps},
      maxDist:{type:"f", value:maxDist},
      subpixelCount:{type:"i", value:subpixelCount},
      edgeThickness:{type:"f", value:0.0},
      contrast:{type:"f", value:Math.exp(-1.2)},
      perspectiveType:{type:"i", value:1},
      viewMode:{type:"i", value: 0},
      multiScreenShot:{type:"i", value:0},
      tile:{type:"vec2", value: new THREE.Vector2(0,0)},
      numTiles:{type:"vec2", value: new THREE.Vector2(1,1)},
 
      controllerCount:{type:"i", value: 0},
      controllerBoosts:{type:"m4", value:g_controllerBoosts},
      planes:{type:"v4", value:planes},
      otherTetNums:{type:"i", value: other_tet_nums},
      entering_face_nums:{type:"i", value: entering_face_nums},
      weights:{type:"f", value: weights},
      SO31tsfms:{type:"m4", value: SO31tsfms},
      gradientThreshholds:{type:"f", value: gradientThreshholds},
      gradientColours:{type:"v3", value: gradientColours}

    },
    // defines: {
    //   // NUM_LIGHTS: lightPositions.length,
    // },
    vertexShader: document.getElementById('vertexShader').textContent,
    fragmentShader: fShader,
    transparent:true
  });

  g_effect.setSize(g_screenResolution.x, g_screenResolution.y);

  //Setup a "quad" to render on-------------------------
  var geom = new THREE.BufferGeometry();
  var vertices = new Float32Array([
    -1.0, -1.0, 0.0,
     1.0, -1.0, 0.0,
     1.0,  1.0, 0.0,

    -1.0, -1.0, 0.0,
     1.0,  1.0, 0.0,
    -1.0,  1.0, 0.0
  ]);
  geom.addAttribute('position',new THREE.BufferAttribute(vertices,3));
  mesh = new THREE.Mesh(geom, g_material);
  scene.add(mesh);

  animate();
}

//-------------------------------------------------------
// Where our scene actually renders out to screen
//-------------------------------------------------------
var animate = function(){
  stats.begin();
  // maxSteps = calcMaxSteps(fps.getFPS(), maxSteps);
  // g_material.uniforms.maxSteps.value = maxSteps;

  g_controls.update();
  THREE.VRController.update();

  g_effect.render(scene, camera, animate);
  stats.end();
}

//-------------------------------------------------------
// Where the magic happens
//-------------------------------------------------------

init();