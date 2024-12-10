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
    const light = new THREE.DirectionalLight(0xffffff, 0.45);
    light.position.set(5, 5, 5);
    light.castShadow = true;
    group.current.add(light);

    const ambientLight = new THREE.AmbientLight(0x404040);
    group.current.add(ambientLight);
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
      <group ref={group} dispose={null} position={[0, -0.18, 4.2]}>
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
      <Html position={[0, -2, 0]} style={{ pointerEvents: 'auto' }}>
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px'
        }}>
          <button
            onClick={toggleListening}
            style={{
              padding: '10px 20px',
              backgroundColor: isListening ? '#e74c3c' : '#2ecc71',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
            disabled={isPlaying}
          >
            {isListening ? 'Stop Recording' : 'Start Recording'}
          </button>
          
          {isListening && <div>Listening...</div>}
          {loading && <div>Processing...</div>}
          {error && <div style={{ color: 'red' }}>{error}</div>}
        </div>
      </Html>
    </Suspense>
  );
}

// preload model dan animasi
useGLTF.preload("/models/66de6b33bb9d79984d437c2f.glb");
useFBX.preload("/animations/Standard Idle.fbx");
useFBX.preload("/animations/Talking.fbx");