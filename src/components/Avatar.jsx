import React, { useRef, useEffect, Suspense } from "react";
import { useGLTF, useFBX, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from 'three';
import useAvatarStore from "../store/avatarStore";

// Viseme mapping for lip sync
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

export function Avatar() {
  const audioRef = useRef(null);
  const group = useRef();
  const mixerRef = useRef();
  const fileInputRef = useRef(null);
  const idleActionRef = useRef(null);
  const talkActionRef = useRef(null);

  // Store states
  const { 
    audioUrl, 
    isPlaying,
    lipSyncData,
    setAudioUrl,
    setLipSyncData,
    setIsPlaying
  } = useAvatarStore();

  // Handle audio file upload
  const handleAudioUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      
      // Generate longer lip sync data that covers the whole audio duration
      const dummyLipSyncData = [];
      const duration = 30; // Assuming 10 seconds duration
      const interval = 0.2; // 200ms per viseme
      
      for(let time = 0; time < duration; time += interval) {
        dummyLipSyncData.push({
          start: time,
          end: time + interval,
          viseme: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'][Math.floor(Math.random() * 8)],
          weight: 0.8 + Math.random() * 0.2 // Random weight between 0.8 and 1
        });
      }
      
      setLipSyncData(dummyLipSyncData);
    }
  };

  // Load models and animations
  const gltf = useGLTF("/models/66de6b33bb9d79984d437c2f.glb", true);
  const { nodes, materials } = gltf;

  const { animations: standardAnim } = useFBX("/animations/Standard Idle.fbx");
  const { animations: talkingAnim } = useFBX("/animations/Talking.fbx");

  // Setup animations and mixers
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

    // Cleanup function
    return () => {
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
      }
    };
  }, [standardAnim, talkingAnim]);

  // Add lighting
  useEffect(() => {
    const light = new THREE.DirectionalLight(0xffffff, 0.45);
    light.position.set(5, 5, 5);
    light.castShadow = true;
    group.current.add(light);

    const ambientLight = new THREE.AmbientLight(0x404040);
    group.current.add(ambientLight);
  }, []);

  // Manage audio playback
  useEffect(() => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.addEventListener("play", () => {
        setIsPlaying(true);
        if (mixerRef.current && talkActionRef.current && idleActionRef.current) {
          // Fade out idle animation smoothly
          idleActionRef.current.fadeOut(0.5);
          // Fade in talking animation smoothly
          talkActionRef.current.reset().fadeIn(0.5).play();
        }
      });

      audio.addEventListener("ended", () => {
        setIsPlaying(false);
        if (mixerRef.current && idleActionRef.current && talkActionRef.current) {
          // Smoothly transition from talking to idle
          talkActionRef.current.fadeOut(0.8);
          idleActionRef.current.reset().fadeIn(0.8).play();
          
          setTimeout(() => {
            // Reset all visemes gradually
            if (nodes.Wolf3D_Head && nodes.Wolf3D_Teeth) {
              Object.values(corresponding).forEach((value) => {
                if (nodes.Wolf3D_Head.morphTargetDictionary[value] !== undefined) {
                  const currentValue = nodes.Wolf3D_Head.morphTargetInfluences[
                    nodes.Wolf3D_Head.morphTargetDictionary[value]
                  ];
                  // Gradually reduce the influence
                  const reduceInfluence = setInterval(() => {
                    nodes.Wolf3D_Head.morphTargetInfluences[
                      nodes.Wolf3D_Head.morphTargetDictionary[value]
                    ] *= 0.9;
                    if (nodes.Wolf3D_Head.morphTargetInfluences[
                      nodes.Wolf3D_Head.morphTargetDictionary[value]
                    ] < 0.01) {
                      nodes.Wolf3D_Head.morphTargetInfluences[
                        nodes.Wolf3D_Head.morphTargetDictionary[value]
                      ] = 0;
                      clearInterval(reduceInfluence);
                    }
                  }, 50);
                }
                if (nodes.Wolf3D_Teeth.morphTargetDictionary[value] !== undefined) {
                  const currentValue = nodes.Wolf3D_Teeth.morphTargetInfluences[
                    nodes.Wolf3D_Teeth.morphTargetDictionary[value]
                  ];
                  // Gradually reduce the influence
                  const reduceInfluence = setInterval(() => {
                    nodes.Wolf3D_Teeth.morphTargetInfluences[
                      nodes.Wolf3D_Teeth.morphTargetDictionary[value]
                    ] *= 0.9;
                    if (nodes.Wolf3D_Teeth.morphTargetInfluences[
                      nodes.Wolf3D_Teeth.morphTargetDictionary[value]
                    ] < 0.01) {
                      nodes.Wolf3D_Teeth.morphTargetInfluences[
                        nodes.Wolf3D_Teeth.morphTargetDictionary[value]
                      ] = 0;
                      clearInterval(reduceInfluence);
                    }
                  }, 50);
                }
              });
            }
          }, 300);
        }
      });

      audio.play().catch(console.error);
    }
  }, [audioUrl]);

  // Lip sync and animation update
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
      // First reset all visemes to a small value
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

      {/* Audio upload interface */}
      <Html position={[0, -1.5, 0]} style={{ pointerEvents: 'auto' }}>
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
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleAudioUpload}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current.click()}
            style={{
              padding: '10px 20px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Upload Audio
          </button>
        </div>
      </Html>
    </Suspense>
  );
}

// Preload models and animations
useGLTF.preload("/models/66de6b33bb9d79984d437c2f.glb");
useFBX.preload("/animations/Standard Idle.fbx");
useFBX.preload("/animations/Talking.fbx");