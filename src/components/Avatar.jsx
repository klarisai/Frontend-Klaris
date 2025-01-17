import { useRef, useEffect, useState, Suspense, useCallback } from "react";
import { useGLTF, useFBX, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from 'three';
import axios from 'axios';

// Viseme mapping for lip sync
const VISEME_MAP = {
    A: "viseme_PP",
    B: "viseme_kk",
    C: "viseme_I",
    D: "viseme_AA",
    E: "viseme_O",
    F: "viseme_U",
    G: "viseme_FF",
    H: "viseme_TH",
    X: "viseme_PP"
};

// Predefined facial expressions
const FACIAL_EXPRESSIONS = {
    default: {},
    bigSmile: {
        browInnerUp: 0.3,
        eyeSquintLeft: 0.6,
        eyeSquintRight: 0.6,
        noseSneerLeft: 0.3,
        noseSneerRight: 0.3,
        mouthPressLeft: 0.8,
        mouthPressRight: 0.8
    },
    smallSmile: {
        browInnerUp: 0.1,
        eyeSquintLeft: 0.2,
        eyeSquintRight: 0.2,
        noseSneerLeft: 0.1,
        noseSneerRight: 0.1,
        mouthPressLeft: 0.3,
        mouthPressRight: 0.3
    }
};

// Custom hook for avatar state management
const useAvatarState = () => {
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
    // Refs
    const audioRef = useRef(null);
    const groupRef = useRef();
    const mixerRef = useRef();
    const recognitionRef = useRef(null);
    const idleActionRef = useRef(null);
    const audioPlayOnceRef = useRef(false);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const smileTimerRef = useRef(null);

    // State
    const [isListening, setIsListening] = useState(false);
    const [loading, setLoading] = useState(false);
    const [, setError] = useState(''); // Menghapus variabel error karena tidak digunakan
    const [blink, setBlink] = useState(false);
    const [facialExpression, setFacialExpression] = useState("bigSmile");
    const [smileIntensity, setSmileIntensity] = useState(1);

    // Get avatar state from custom hook
    const {
        audioUrl,
        isPlaying,
        lipSyncData,
        setAudioUrl,
        setLipSyncData,
        setIsPlaying,
        setConversation
    } = useAvatarState();

    // Load 3D models and animations
    const { nodes, materials } = useGLTF("/models/KlarisFix.glb");
    const { animations: idleAnimations } = useFBX("/animations/idl.fbx");

    // Dynamic smile effect
    useEffect(() => {
        const updateSmile = () => {
            // Randomly choose between big and small smile
            const newExpression = Math.random() > 0.5 ? "bigSmile" : "smallSmile";
            setFacialExpression(newExpression);

            // Random intensity variation
            setSmileIntensity(0.7 + Math.random() * 0.3);

            // Set next update interval (between 2-5 seconds)
            smileTimerRef.current = setTimeout(updateSmile, 2000 + Math.random() * 3000);
        };

        updateSmile();
        return () => clearTimeout(smileTimerRef.current);
    }, []);

    // Helper function for smooth morphing
    const lerpMorphTarget = (target, value, speed = 0.1) => {
        if (!groupRef.current) return;

        groupRef.current.traverse((child) => {
            if (child.isSkinnedMesh && child.morphTargetDictionary) {
                const index = child.morphTargetDictionary[target];
                if (index === undefined || child.morphTargetInfluences[index] === undefined) return;

                child.morphTargetInfluences[index] = THREE.MathUtils.lerp(
                    child.morphTargetInfluences[index],
                    value * smileIntensity,
                    speed
                );
            }
        });
    };

    // Process audio and generate lip sync data
   const processAudioFile = useCallback((url) => {
        setAudioUrl(url);

        // Generate temporary lip sync data with moderate values
        const tempLipSyncData = Array.from({ length: 150 }, (_, i) => ({
            start: i * 0.2,
            end: (i + 1) * 0.2,
            viseme: Object.keys(VISEME_MAP)[Math.floor(Math.random() * 8)],
            weight: 0.4 + Math.random() * 0.2 // Reduced weight range to 0.4-0.6 for more natural movement
        }));

        setLipSyncData(tempLipSyncData);
    }, [setAudioUrl]);

    // Add message to conversation
    const addToConversation = useCallback((role, message) => {
        setConversation(prev => [...prev, { role, message }]);
    }, [setConversation]);

    // Send query to backend
    const sendQueryToBackend = useCallback(async (query, audioBlob) => {
        setLoading(true);
        setAudioUrl('');
        setError('');

        try {
            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:5000';
            const response = await axios.post(`${backendUrl}/api/query`, {
                query,
                audio: audioBlob
            }, {
                headers: { 'Content-Type': 'application/json' }
            });

            const answer = response.data.answer || 'No answer available.';
            addToConversation('assistant', answer);

            if (response.data.audio_file) {
                processAudioFile(`${backendUrl}/api/audio/${response.data.audio_file}`);
            }
        } catch (err) {
            console.error('Backend Error:', err);
            setError('Failed to connect to server. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [addToConversation, processAudioFile, setAudioUrl, setError]);

    // Speech recognition handler
    const handleSpeechResult = useCallback((event) => {
        if (event.results?.[0]?.[0]) {
            const transcript = event.results[0][0].transcript;
            setIsListening(false);
            addToConversation('user', transcript);
            sendQueryToBackend(transcript);
        }
    }, [addToConversation, sendQueryToBackend]);

    // Initialize speech recognition
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.lang = 'id-ID';
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = false;
            recognitionRef.current.onresult = handleSpeechResult;

            recognitionRef.current.onerror = (event) => {
                console.error('Speech Recognition Error:', event.error);
                setIsListening(false);
                setError(event.error === 'no-speech'
                    ? 'No speech detected. Please try again.'
                    : 'Speech recognition error. Please try again.');

                if (event.error === 'no-speech') {
                    recognitionRef.current?.stop();
                }
            };
        } else {
           setError('Speech recognition not supported in this browser.');
        }

        return () => recognitionRef.current?.stop();
    }, [handleSpeechResult, setError]);

    // Toggle listening state
    const toggleListening = async () => {
        if (isListening) {
            mediaRecorderRef.current?.state === 'recording' && mediaRecorderRef.current.stop();
            recognitionRef.current?.stop();
        } else {
            setError('');
            chunksRef.current = [];

            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });

                mediaRecorderRef.current.ondataavailable = (event) => {
                    event.data.size > 0 && chunksRef.current.push(event.data);
                };

                mediaRecorderRef.current.onstop = () => {
                    const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
                    sendQueryToBackend('', audioBlob);
                };

                mediaRecorderRef.current.start();
                recognitionRef.current?.start();
            } catch (err) {
                console.error('Microphone Access Error:', err);
                setError('Failed to access microphone. Please check permissions.');
                setIsListening(false);
                return;
            }
        }

        setIsListening(!isListening);
    };

    // Setup animations and mixer
    useEffect(() => {
        if (groupRef.current && idleAnimations.length > 0) {
            mixerRef.current = new THREE.AnimationMixer(groupRef.current);

            idleActionRef.current = mixerRef.current.clipAction(idleAnimations[0]);
            idleActionRef.current.play();
        }

        return () => mixerRef.current?.stopAllAction();
    }, [idleAnimations]);

    // Setup lighting
    useEffect(() => {
        if (!groupRef.current) return;

        // Main directional light (key light)
        const mainLight = new THREE.DirectionalLight(0xfff5e6, 2.0);
        mainLight.position.set(4, 4, 2);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 4096;
        mainLight.shadow.mapSize.height = 4096;
        mainLight.shadow.camera.near = 0.1;
        mainLight.shadow.camera.far = 1000;
        mainLight.shadow.bias = -0.00001;
        groupRef.current.add(mainLight);

        // Fill light (softer blue tint)
        const fillLight = new THREE.DirectionalLight(0xb6ceff, 0.8);
        fillLight.position.set(-3, 2, -2);
        fillLight.castShadow = true;
        groupRef.current.add(fillLight);

        // Ambient light (improved color)
        const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
        groupRef.current.add(ambientLight);

        // Rim light (dramatic back lighting)
        const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
        rimLight.position.set(0, 3, -5);
        groupRef.current.add(rimLight);

        // Eye lights (for catch lights in eyes)
        const eyeLight1 = new THREE.SpotLight(0xffffff, 1.0);
        eyeLight1.position.set(0, 2, 3);
        eyeLight1.angle = Math.PI / 6;
        eyeLight1.penumbra = 1;
        eyeLight1.decay = 2;
        eyeLight1.distance = 10;
        groupRef.current.add(eyeLight1);

        const eyeLight2 = new THREE.SpotLight(0xffffff, 0.8);
        eyeLight2.position.set(-2, 2, 3);
        eyeLight2.angle = Math.PI / 8;
        eyeLight2.penumbra = 1;
        eyeLight2.decay = 2;
        eyeLight2.distance = 10;
        groupRef.current.add(eyeLight2);

        // Bounce light (ground reflection)
        const bounceLight = new THREE.DirectionalLight(0xfff5e6, 0.4);
        bounceLight.position.set(0, -3, 2);
        groupRef.current.add(bounceLight);

        // Hair highlight
        const hairLight = new THREE.SpotLight(0xfff5e6, 0.6);
        hairLight.position.set(2, 5, -2);
        hairLight.angle = Math.PI / 4;
        hairLight.penumbra = 0.5;
        groupRef.current.add(hairLight);

        return () => {
            if (groupRef.current) {
                groupRef.current.remove(mainLight);
                groupRef.current.remove(fillLight);
                groupRef.current.remove(ambientLight);
                groupRef.current.remove(rimLight);
                groupRef.current.remove(eyeLight1);
                groupRef.current.remove(eyeLight2);
                groupRef.current.remove(bounceLight);
                groupRef.current.remove(hairLight);
            }
        };
    }, []);

    // Handle audio playback
    useEffect(() => {
        if (!audioUrl) return;

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        const handlePlay = () => {
            setIsPlaying(true);
        };

        const handleEnd = () => {
            setIsPlaying(false);
            // Reset visemes with a moderate value
            if (nodes.Wolf3D_Head && nodes.Wolf3D_Teeth) {
                Object.values(VISEME_MAP).forEach(viseme => {
                    [nodes.Wolf3D_Head, nodes.Wolf3D_Teeth].forEach(node => {
                        if (node.morphTargetDictionary[viseme] !== undefined) {
                            node.morphTargetInfluences[node.morphTargetDictionary[viseme]] = 0.1;
                        }
                    });
                });
            }
            audioPlayOnceRef.current = false;
        };

        const handleError = (error) => {
            console.error("Audio Playback Error:", error);
            setIsPlaying(false);
           setError("Error playing audio.");
            audioPlayOnceRef.current = false;
        };

        audio.addEventListener("play", handlePlay);
        audio.addEventListener("ended", handleEnd);
        audio.addEventListener("error", handleError);

        if (!audioPlayOnceRef.current) {
            audio.play().catch(handleError);
            audioPlayOnceRef.current = true;
        }

        return () => {
            audio.removeEventListener("play", handlePlay);
            audio.removeEventListener("ended", handleEnd);
            audio.removeEventListener("error", handleError);
            audio.pause();
            audio.currentTime = 0;
        };
    }, [audioUrl, nodes, setIsPlaying, setError]);

    // Automatic blinking
    useEffect(() => {
        let blinkTimer;

        const triggerBlink = () => {
            blinkTimer = setTimeout(() => {
                setBlink(true);
                setTimeout(() => {
                    setBlink(false);
                    triggerBlink();
                }, 200); // Keep blink duration at 200ms for natural look
            }, 5000); // Fixed 5 second interval between blinks
        };

        triggerBlink();
        return () => clearTimeout(blinkTimer);
    }, []);

    // Animation frame updates
    useFrame((state, delta) => {
        // Update animation mixer
        mixerRef.current?.update(delta);

        // Update eye blinks
        lerpMorphTarget("eyeBlinkLeft", blink ? 1 : 0, 0.5);
        lerpMorphTarget("eyeBlinkRight", blink ? 1 : 0, 0.5);

        // Update facial expressions
        if (nodes.EyeLeft?.morphTargetDictionary) {
            Object.keys(nodes.EyeLeft.morphTargetDictionary).forEach(key => {
                if (key === "eyeBlinkLeft" || key === "eyeBlinkRight") return;

                const expression = FACIAL_EXPRESSIONS[facialExpression];
                lerpMorphTarget(key, expression?.[key] || 0, 0.1);
            });
        }

        // Update lip sync with moderate values
        if (!audioRef.current?.currentTime || !isPlaying || !lipSyncData.length) return;

        const currentTime = audioRef.current.currentTime;
        const currentViseme = lipSyncData.find(
            data => currentTime >= data.start && currentTime <= data.end
        );

        if (nodes.Wolf3D_Head && nodes.Wolf3D_Teeth) {
            // Reset all visemes to a small base value
            Object.values(VISEME_MAP).forEach(viseme => {
                [nodes.Wolf3D_Head, nodes.Wolf3D_Teeth].forEach(node => {
                    if (node.morphTargetDictionary[viseme] !== undefined) {
                        node.morphTargetInfluences[node.morphTargetDictionary[viseme]] = 0.1;
                    }
                });
            });

            // Apply current viseme with moderate intensity
            if (currentViseme && VISEME_MAP[currentViseme.viseme]) {
                const viseme = VISEME_MAP[currentViseme.viseme];
                const weight = Math.min(0.5, currentViseme.weight || 0.4); // Cap maximum weight at 0.5

                [nodes.Wolf3D_Head, nodes.Wolf3D_Teeth].forEach(node => {
                    if (node.morphTargetDictionary[viseme] !== undefined) {
                        node.morphTargetInfluences[node.morphTargetDictionary[viseme]] = weight;
                    }
                });
            }
        }
    });

    // Head tracking
    useFrame((state) => {
        const head = groupRef.current?.getObjectByName("Head");
        if (head) {
            const cameraPos = state.camera.position.clone();
            cameraPos.y = head.position.y;
            head.lookAt(cameraPos);
        }
    });

    return (
        <Suspense fallback={<Html>Loading...</Html>}>
            <group ref={groupRef} position={[-0.3, -15, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={9.1}>
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

// Preload assets
useGLTF.preload("/models/KlarisFix.glb");
useFBX.preload("/animations/idl.fbx");