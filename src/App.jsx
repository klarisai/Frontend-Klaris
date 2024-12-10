import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Avatar } from './components/Avatar'; // Adjust path as needed

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas
        camera={{ 
          position: [0, 1.5, 5], 
          fov: 45
        }}
        onContextMenu={(e) => e.preventDefault()} // Prevent right click
        onWheel={(e) => e.preventDefault()} // Prevent scroll/zoom
      >
        <ambientLight intensity={0.6} />
        <pointLight position={[10, 10, 10]} />
        <pointLight position={[-10, 5, 5]} intensity={0.8} color="#ffffff" />
        <directionalLight
          position={[-5, 3, 0]}
          intensity={0.5}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <OrbitControls 
          enableZoom={false}
          enablePan={false}
          enableRotate={false}
        />
        <Avatar />
      </Canvas>
    </div>
  );
}

export default App;
