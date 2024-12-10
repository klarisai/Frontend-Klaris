import React, { useRef, useEffect, useState, Suspense, useCallback } from "react";
import { useGLTF, useFBX, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from 'three';
import axios from 'axios';

// viseme mapping untuk lip sync
const corresponding = {
  A: "viseme_PP",
  B: "viseme_kk", 
  C: "viseme_I",
  D: "viseme_AA",
  E: "viseme_O",
  F: "viseme_U",
  G: "viseme_FF",
  H: "viseme_TH",
  X: "viseme_PP",
};

// custom hook untuk state avatar
const useAvatarStore = () => {
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lipSyncData, setLipSyncData] = useState([]);
  const [conversation, setConversation] = useState([]);

  return {
    audioUrl,
    isPlaying,
    lipSyncData,
    conversation,
    setAudioUrl,
    setIsPlaying,
    setLipSyncData,
    setConversation
  };
};

export function Avatar() {
  const audioRef = useRef(null);
  const group = useRef();
  const mixerRef = useRef();
  const recognitionRef = useRef(null);
  const idleActionRef = useRef(null);
  const talkActionRef = useRef(null);

  // States
  const [isListening, setIsListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Store states
  const { 
    audioUrl, 
    isPlaying,
    lipSyncData,
    conversation,
    setAudioUrl,
    setLipSyncData,
    setIsPlaying,
    setConversation
  } = useAvatarStore();

  // Process audio file with lip sync
  const processAudioFile = (url) => {
    setAudioUrl(url);
    
    // Generate dummy lip sync data (replace with actual lip sync generation in production)
    const dummyLipSyncData = [];
    const duration = 30;
    const interval = 0.2;
    
    for(let time = 0; time < duration; time += interval) {
      dummyLipSyncData.push({
        start: time,
        end: time + interval,
        viseme: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'][Math.floor(Math.random() * 8)],
        weight: 0.8 + Math.random() * 0.2
      });
    }
    
    setLipSyncData(dummyLipSyncData);
  };

  const addToConversation = (role, message) => {
    setConversation(prev => [...prev, { role, message }]);
  };

  const sendQueryToBackend = async (query) => {
    setLoading(true);
    setAudioUrl('');
    setError('');
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:5000';
      const result = await axios.post(`${backendUrl}/api/query`, { query });
      const answer = result.data.answer || 'Answer not available.';
      addToConversation('assistant', answer);
      if (result.data.audio_file) {
        const audioUrl = `${backendUrl}/api/audio/${result.data.audio_file}`;
        processAudioFile(audioUrl);
      }
    } catch (error) {
      console.error('Server Error:', error);
      setError('Error connecting to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSpeechResult = useCallback((event) => {
    const transcript = event.results[0][0].transcript;
    setIsListening(false);
    addToConversation('user', transcript);
    sendQueryToBackend(transcript);
  }, []);

  // inisialisasi speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = 'id-ID';
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = handleSpeechResult;
      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
        if (event.error === 'no-speech') {
          setError('No speech detected. Please try speaking again.');
          // otomatis berhenti setelah error no-speech
          recognitionRef.current.stop();
        } else {
          setError('Speech recognition error. Please try again.');
        }
      };
    } else {
      setError('Speech recognition not supported in this browser.');
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [handleSpeechResult]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setError(''); // hapus error sebelumnya
      recognitionRef.current.start();
    }
    setIsListening(!isListening);
  };

  // load model dan animasi
  const gltf = useGLTF("/models/66de6b33bb9d79984d437c2f.glb", true);
  const { nodes, materials } = gltf;

  const { animations: standardAnim } = useFBX("/animations/Standard Idle.fbx");
  const { animations: talkingAnim } = useFBX("/animations/Talking.fbx");

  // setup animasi dan mixer
  useEffect(() => {
    if (group.current && standardAnim.length > 0) {
      mixerRef.current = new THREE.AnimationMixer(group.current);
      
      idleActionRef.current = mixerRef.current.clipAction(standardAnim[0]);
      idleActionRef.current.play();

      if (talkingAnim.length > 0) {
        talkActionRef.current = mixerRef.current.clipAction(talkingAnim[0]);
        talkActionRef.current.setEffectiveWeight(0.900);
        talkActionRef.current.setLoop(THREE.LoopRepeat);
      }
    }

    return () => {
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
      }
    };
  }, [standardAnim, talkingAnim]);

  // tambahkan pencahayaan
  useEffect(() => {
    // Pencahayaan utama (sisi terang) - simulasi cahaya matahari
    const mainLight = new THREE.DirectionalLight(0xfff5e6, 1.2);
    mainLight.position.set(4, 4, 2);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 500;
    mainLight.shadow.bias = -0.0001;
    group.current.add(mainLight);

    // Pencahayaan sekunder (sisi gelap) - simulasi cahaya pantulan
    const fillLight = new THREE.DirectionalLight(0xb6ceff, 0.4);
    fillLight.position.set(-3, 2, -2);
    fillLight.castShadow = true;
    group.current.add(fillLight);

    // Ambient light untuk detail bayangan
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    group.current.add(ambientLight);

    // Rim light untuk dimensi dan pemisahan dari background
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
    rimLight.position.set(0, 3, -5);
    group.current.add(rimLight);

    // Tambahan soft light untuk mata dan detail wajah
    const eyeLight = new THREE.SpotLight(0xffffff, 0.6);
    eyeLight.position.set(0, 2, 3);
    eyeLight.angle = Math.PI / 6;
    eyeLight.penumbra = 1;
    eyeLight.decay = 2;
    eyeLight.distance = 10;
    group.current.add(eyeLight);
  }, []);

  // manage audio playback
  useEffect(() => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.addEventListener("play", () => {
        setIsPlaying(true);
        if (mixerRef.current && talkActionRef.current && idleActionRef.current) {
          idleActionRef.current.fadeOut(0.5);
          talkActionRef.current.reset().fadeIn(0.5).play();
        }
      });

      audio.addEventListener("ended", () => {
        setIsPlaying(false);
        if (mixerRef.current && idleActionRef.current && talkActionRef.current) {
          talkActionRef.current.fadeOut(0.8);
          idleActionRef.current.reset().fadeIn(0.8).play();
          
          setTimeout(() => {
            if (nodes.Wolf3D_Head && nodes.Wolf3D_Teeth) {
              Object.values(corresponding).forEach((value) => {
                if (nodes.Wolf3D_Head.morphTargetDictionary[value] !== undefined) {
                  nodes.Wolf3D_Head.morphTargetInfluences[
                    nodes.Wolf3D_Head.morphTargetDictionary[value]
                  ] = 0;
                }
                if (nodes.Wolf3D_Teeth.morphTargetDictionary[value] !== undefined) {
                  nodes.Wolf3D_Teeth.morphTargetInfluences[
                    nodes.Wolf3D_Teeth.morphTargetDictionary[value]
                  ] = 0;
                }
              });
            }
          }, 300);
        }
      });

      audio.play().catch(console.error);
    }
  }, [audioUrl]);

  // lip sync dan animasi update
  useFrame((state, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }

    if (!audioRef.current || !isPlaying || !lipSyncData.length) return;

    const currentTime = audioRef.current.currentTime;
    
    const currentViseme = lipSyncData.find(
      (data) => currentTime >= data.start && currentTime <= data.end
    );

    if (nodes.Wolf3D_Head && nodes.Wolf3D_Teeth) {
      Object.values(corresponding).forEach((value) => {
        if (nodes.Wolf3D_Head.morphTargetDictionary[value] !== undefined) {
          nodes.Wolf3D_Head.morphTargetInfluences[
            nodes.Wolf3D_Head.morphTargetDictionary[value]
          ] = 0.1;
        }
        if (nodes.Wolf3D_Teeth.morphTargetDictionary[value] !== undefined) {
          nodes.Wolf3D_Teeth.morphTargetInfluences[
            nodes.Wolf3D_Teeth.morphTargetDictionary[value]
          ] = 0.1;
        }
      });

      if (currentViseme && corresponding[currentViseme.viseme]) {
        const visemeValue = corresponding[currentViseme.viseme];
        
        if (nodes.Wolf3D_Head.morphTargetDictionary[visemeValue] !== undefined) {
          nodes.Wolf3D_Head.morphTargetInfluences[
            nodes.Wolf3D_Head.morphTargetDictionary[visemeValue]
          ] = currentViseme.weight || 1;
        }
        
        if (nodes.Wolf3D_Teeth.morphTargetDictionary[visemeValue] !== undefined) {
          nodes.Wolf3D_Teeth.morphTargetInfluences[
            nodes.Wolf3D_Teeth.morphTargetDictionary[visemeValue]
          ] = currentViseme.weight || 1;
        }
      }
    }
  });

  return (
    <Suspense fallback={<Html>Loading...</Html>}>
      <group ref={group} dispose={null} position={[0, -0.21, 4.3]}>
        <primitive object={nodes.Hips} />
        <skinnedMesh
          name="EyeLeft"
          geometry={nodes.EyeLeft.geometry}
          material={materials.Wolf3D_Eye}
          skeleton={nodes.EyeLeft.skeleton}
          morphTargetDictionary={nodes.EyeLeft.morphTargetDictionary}
          morphTargetInfluences={nodes.EyeLeft.morphTargetInfluences}
        />
        <skinnedMesh
          name="EyeRight"
          geometry={nodes.EyeRight.geometry}
          material={materials.Wolf3D_Eye}
          skeleton={nodes.EyeRight.skeleton}
          morphTargetDictionary={nodes.EyeRight.morphTargetDictionary}
          morphTargetInfluences={nodes.EyeRight.morphTargetInfluences}
        />
        <skinnedMesh
          name="Wolf3D_Head"
          geometry={nodes.Wolf3D_Head.geometry}
          material={materials.Wolf3D_Skin}
          skeleton={nodes.Wolf3D_Head.skeleton}
          morphTargetDictionary={nodes.Wolf3D_Head.morphTargetDictionary}
          morphTargetInfluences={nodes.Wolf3D_Head.morphTargetInfluences}
        />
        <skinnedMesh
          name="Wolf3D_Teeth"
          geometry={nodes.Wolf3D_Teeth.geometry}
          material={materials.Wolf3D_Teeth}
          skeleton={nodes.Wolf3D_Teeth.skeleton}
          morphTargetDictionary={nodes.Wolf3D_Teeth.morphTargetDictionary}
          morphTargetInfluences={nodes.Wolf3D_Teeth.morphTargetInfluences}
        />
        <skinnedMesh
          geometry={nodes.Wolf3D_Hair.geometry}
          material={materials.Wolf3D_Hair}
          skeleton={nodes.Wolf3D_Hair.skeleton}
        />
        <skinnedMesh
          geometry={nodes.Wolf3D_Glasses.geometry}
          material={materials.Wolf3D_Glasses}
          skeleton={nodes.Wolf3D_Glasses.skeleton}
        />
        <skinnedMesh
          geometry={nodes.Wolf3D_Body.geometry}
          material={materials.Wolf3D_Body}
          skeleton={nodes.Wolf3D_Body.skeleton}
        />
        <skinnedMesh
          geometry={nodes.Wolf3D_Outfit_Bottom.geometry}  
          material={materials.Wolf3D_Outfit_Bottom}
          skeleton={nodes.Wolf3D_Outfit_Bottom.skeleton}
        />
        <skinnedMesh
          geometry={nodes.Wolf3D_Outfit_Footwear.geometry}
          material={materials.Wolf3D_Outfit_Footwear}
          skeleton={nodes.Wolf3D_Outfit_Footwear.skeleton}
        />
        <skinnedMesh
          geometry={nodes.Wolf3D_Outfit_Top.geometry}
          material={materials.Wolf3D_Outfit_Top}
          skeleton={nodes.Wolf3D_Outfit_Top.skeleton}
        />
      </group>

      {/* Voice chat interface */}
      <Html position={[0, -2.5, 0]} style={{ pointerEvents: 'auto' }}>
        <div style={{
          position: 'absolute',
          bottom: '30px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px'
        }}>
          <div style={{ position: 'relative', minHeight: '100px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <button
              onClick={toggleListening}
              style={{
                width: '55px',
                height: '55px',
                backgroundColor: isListening ? 'rgba(231, 76, 60, 0.9)' : 'rgba(46, 204, 113, 0.9)',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                zIndex: 1,
                transition: 'all 0.3s ease',
                transform: isListening ? 'scale(1.1)' : 'scale(1)',
              }}
              disabled={isPlaying}
              onMouseEnter={(e) => e.target.style.transform = isListening ? 'scale(1.15)' : 'scale(1.05)'}
              onMouseLeave={(e) => e.target.style.transform = isListening ? 'scale(1.1)' : 'scale(1)'}
            >
              {isListening ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" fill="white"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" fill="white"/>
                  <circle cx="12" cy="12" r="11" stroke="white" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6">
                    <animateTransform
                      attributeName="transform"
                      attributeType="XML"
                      type="rotate"
                      from="0 12 12"
                      to="360 12 12"
                      dur="4s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" fill="white"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" fill="white"/>
                </svg>
              )}
            </button>
            
            <div style={{ position: 'absolute', top: '80px', width: '100%', display: 'flex', justifyContent: 'center' }}>
              {isListening && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#fff'
                }}>
                  <div style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#e74c3c',
                    animation: 'pulse 1s infinite'
                  }}/>
                  Mendengarkan...
                </div>
              )}
              {loading && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#fff'
                }}>
                  <div style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#f1c40f',
                    animation: 'pulse 1s infinite'
                  }}/>
                  Memproses...
                </div>
              )}
            </div>
          </div>
          <style>
            {`
              @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.4; }
                100% { opacity: 1; }
              }
              @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-10px) translateX(-50%); }
                to { opacity: 1; transform: translateY(0) translateX(-50%); }
              }
            `}
          </style>
        </div>
      </Html>
    </Suspense>
  );
}

// preload model dan animasi
useGLTF.preload("/models/66de6b33bb9d79984d437c2f.glb");
useFBX.preload("/animations/Standard Idle.fbx");
useFBX.preload("/animations/Talking.fbx");