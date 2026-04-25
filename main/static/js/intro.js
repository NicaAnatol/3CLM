        window.addEventListener('load', function() {
            setTimeout(() => {
                document.getElementById('loading').classList.add('hidden');
            }, 1000);
        });
        let scene, camera, renderer, model, mixer;
        let clock = new THREE.Clock();

        function initThreeJS() {
            const canvas = document.getElementById('threeCanvas');
            const width = canvas.parentElement.clientWidth;
            const height = canvas.parentElement.clientHeight;
            scene = new THREE.Scene();
            scene.background = null;
            scene.fog = new THREE.Fog(0x0f172a, 100, 1000);
            camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
            camera.position.set(0, 50, 150);
            camera.lookAt(0, 0, 0);
            renderer = new THREE.WebGLRenderer({ 
                canvas: canvas,
                antialias: true,
                alpha: true
            });
            renderer.setSize(width, height);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
            scene.add(ambientLight);
            
            const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
            directionalLight.position.set(50, 100, 50);
            directionalLight.castShadow = true;
            scene.add(directionalLight);

            const hemisphereLight = new THREE.HemisphereLight(0x667eea, 0x764ba2, 0.3);
            scene.add(hemisphereLight);
            loadGLTFModel();
            window.addEventListener('resize', onWindowResize);
        }


function loadGLTFModel() {
    const loader = new THREE.GLTFLoader();
    

    loader.load(
        '/media/exports/city_pack_3.glb',
        (gltf) => {
            model = gltf.scene;
            
        
            model.scale.set(0.007, 0.007, 0.007); 
            model.position.set(0, 0, 0);
            
            scene.add(model);
            
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
        },

        (xhr) => {
        },
        (error) => {
        }
    );
}

        function animate() {
            requestAnimationFrame(animate);
            
            const delta = clock.getDelta();
            
            if (camera) {
                const time = Date.now() * 0.001;
                camera.position.x = Math.sin(time * 0.1) * 150;
                camera.position.y = 100;
                camera.position.z = Math.cos(time * 0.1) * 150;
                camera.lookAt(0, 30, 0);
            }
            
            scene.children.forEach(child => {
                if (child.userData && child.userData.originalY) {
                    const time = Date.now() * 0.001;
                    const pulse = Math.sin(time * child.userData.speed + child.userData.phase) * 2;
                    child.position.y = child.userData.originalY + pulse;
                    child.scale.y = 1 + pulse * 0.02;
                }
            });
            
            if (mixer) {
                mixer.update(delta);
            }
            
            if (renderer && scene && camera) {
                renderer.render(scene, camera);
            }
        }

        function onWindowResize() {
            const canvas = document.getElementById('threeCanvas');
            const width = canvas.parentElement.clientWidth;
            const height = canvas.parentElement.clientHeight;
            
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        }

        document.addEventListener('DOMContentLoaded', () => {
            initThreeJS();
            animate();
            
            document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                anchor.addEventListener('click', function(e) {
                    e.preventDefault();
                    const targetId = this.getAttribute('href');
                    if (targetId === '#') return;
                    
                    const targetElement = document.querySelector(targetId);
                    if (targetElement) {
                        window.scrollTo({
                            top: targetElement.offsetTop - 80,
                            behavior: 'smooth'
                        });
                    }
                });
            });
            
            window.addEventListener('scroll', () => {
                const navbar = document.querySelector('.navbar');
                if (window.scrollY > 50) {
                    navbar.style.background = 'rgba(15, 23, 42, 0.98)';
                    navbar.style.boxShadow = '0 5px 20px rgba(0, 0, 0, 0.1)';
                } else {
                    navbar.style.background = 'rgba(15, 23, 42, 0.95)';
                    navbar.style.boxShadow = 'none';
                }
            });

            const observerOptions = {
                threshold: 0.2,
                rootMargin: '0px 0px -50px 0px'
            };

            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.style.opacity = '1';
                        entry.target.style.transform = 'translateY(0)';
                    }
                });
            }, observerOptions);
            document.querySelectorAll('.feature-card, .gallery-item, .testimonial-card').forEach((el) => {
                el.style.opacity = '0';
                el.style.transform = 'translateY(30px)';
                el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
                observer.observe(el);
            });
        });