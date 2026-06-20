import * as THREE from 'three';

const GRAVITY = -15.0; // Gravity constant for parabolic trajectory

//Updates physics for projectiles and checks collisions
export function updatePhysics(projectiles, enemies, scene, dt, onLionKilled) {
    // Update Projectiles (Parabolic Physics)
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        
        // Euler integration: gravity, then position.
        p.velocity.y += GRAVITY * dt;
        p.mesh.position.addScaledVector(p.velocity, dt);

        // Remove if it hits the ground
        if (p.mesh.position.y < 0) {
            scene.remove(p.mesh);
            projectiles.splice(i, 1);
            continue;
        }

        // Collision Detection (Simple Sphere-to-Point/Box distance)
        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            if (enemy.isDead) continue;

            // Collision center on the lion's body, with a generous radius so on-target hits register.
            const hitCenter = enemy.model.position.clone();
            hitCenter.y += 1.3;
            const distance = p.mesh.position.distanceTo(hitCenter);

            if (distance < 2.0) { // Collision Radius
                // Impact direction: used by the death animation
                const impactDirection = p.velocity.clone().normalize();

                scene.remove(p.mesh);
                projectiles.splice(i, 1);

                // Score/levels (main.js system).
                if (typeof onLionKilled === 'function') {
                    onLionKilled(enemy);
                }

                // Death animation
                if (typeof window !== 'undefined' && window.animateLionDeathGlobal) {
                    window.animateLionDeathGlobal(enemy, impactDirection);
                } else {
                    // Fallback if the animation isn't available.
                    enemy.isDead = true;
                    enemy.model.rotation.x = Math.PI / 2;
                }

                break; // stone consumed
            }
        }
    }
}

export function slingPhysics(davidGroup, isThrowing, dt, isSlingOpen) {
    if (!davidGroup || !davidGroup.sling || !davidGroup.pocket) return;
    if (davidGroup) {
        if (!davidGroup.pocketVelocity) {
            davidGroup.pocketVelocity = new THREE.Vector3(0, 0, 0);
        }
        if (!davidGroup.pocketWorldPos) {
            davidGroup.pocketWorldPos = new THREE.Vector3();
            davidGroup.pocket.getWorldPosition(davidGroup.pocketWorldPos);
        }
        // management of the free string
        if (!davidGroup.freeStringVelocity) {
            davidGroup.freeStringVelocity = new THREE.Vector3(0, 0, 0);
        }
        if (!davidGroup.freeStringWorldPos) {
            davidGroup.freeStringWorldPos = new THREE.Vector3();
            davidGroup.sling.getWorldPosition(davidGroup.freeStringWorldPos);
        }
        const handWorldPos = new THREE.Vector3();
        davidGroup.sling.getWorldPosition(handWorldPos);

        const stringLength = 0.8;
        const sling_gravity = -50.0;
        const pocketRadius = 0.18;

        if (isThrowing) {
            davidGroup.pocket.position.set(0, -0.8, 0);
            davidGroup.pocket.rotation.set(0, 0, 0);
            davidGroup.pocket.getWorldPosition(davidGroup.pocketWorldPos); 
            davidGroup.pocketVelocity.set(0, 0, 0);
            davidGroup.freeStringWorldPos.copy(handWorldPos);
            davidGroup.freeStringVelocity.set(0, 0, 0);
        } else {
            // gravity with pocket attracted by the ground
            davidGroup.pocketVelocity.y += sling_gravity * dt;
            davidGroup.pocketVelocity.multiplyScalar(0.90); // friction
            
            davidGroup.pocketWorldPos.addScaledVector(davidGroup.pocketVelocity, dt);
            
            const dirToPocket = new THREE.Vector3().subVectors(davidGroup.pocketWorldPos, handWorldPos);
            if (dirToPocket.lengthSq() === 0) {
                dirToPocket.y = -1;
            }
            dirToPocket.normalize().multiplyScalar(stringLength);
            davidGroup.pocketWorldPos.copy(handWorldPos).add(dirToPocket);
            
            if (davidGroup.pocketWorldPos.y < pocketRadius) {
                davidGroup.pocketWorldPos.y = pocketRadius;
                davidGroup.pocketVelocity.y = 0; 
                davidGroup.pocketVelocity.x *= 0.5; 
                davidGroup.pocketVelocity.z *= 0.5;
            }

            const localPocketPos = davidGroup.sling.worldToLocal(davidGroup.pocketWorldPos.clone());
            davidGroup.pocket.position.copy(localPocketPos);
            
            // pocket orientation and gravity
            if (isSlingOpen) {                
                const stringDir = new THREE.Vector3().subVectors(handWorldPos, davidGroup.pocketWorldPos).normalize();
                const localUp = new THREE.Vector3(0, 1, 0);
                const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(localUp, stringDir);
                
                const parentWorldInverse = new THREE.Quaternion();
                davidGroup.sling.getWorldQuaternion(parentWorldInverse).invert();
                davidGroup.pocket.quaternion.copy(parentWorldInverse).multiply(targetQuaternion);
                davidGroup.pocket.rotateY(Math.PI / 2);
            } else {
                // orientation parallel to the ground
                davidGroup.pocket.up.set(0, 0, 1);
                const directionDown = new THREE.Vector3().subVectors(davidGroup.pocketWorldPos, handWorldPos);
                const lookTarget = davidGroup.pocketWorldPos.clone().add(directionDown);
                davidGroup.pocket.lookAt(lookTarget);
                davidGroup.pocket.up.set(0, 1, 0);
            };

            if (isSlingOpen) {
                // right string hang
                davidGroup.freeStringVelocity.y += sling_gravity * dt;
                davidGroup.freeStringVelocity.multiplyScalar(0.85);
                davidGroup.freeStringWorldPos.addScaledVector(davidGroup.freeStringVelocity, dt);

                const pocketLeftWorld = new THREE.Vector3();
                davidGroup.pocket.localToWorld(pocketLeftWorld.set(-0.22, 0, 0));
                
                const StringDir = new THREE.Vector3().subVectors(davidGroup.freeStringWorldPos, pocketLeftWorld);
                StringDir.normalize().multiplyScalar(stringLength);
                davidGroup.freeStringWorldPos.copy(pocketLeftWorld).add(StringDir);
                // collision with ground
                if (davidGroup.freeStringWorldPos.y < 0) {
                    davidGroup.freeStringWorldPos.y = 0;
                    davidGroup.freeStringVelocity.set(0, 0, 0);
                }
            } else{
                davidGroup.freeStringWorldPos.copy(handWorldPos);
                davidGroup.freeStringVelocity.set(0, 0, 0);
            }
        }
        const leftOffset = new THREE.Vector3(0, -0.22, 0).applyQuaternion(davidGroup.pocket.quaternion);
        const rightOffset = new THREE.Vector3(0, 0.22, 0).applyQuaternion(davidGroup.pocket.quaternion);
        
        const localLeftEnd = davidGroup.pocket.position.clone().add(leftOffset);
        const localRightEnd = davidGroup.pocket.position.clone().add(rightOffset);

        // Left String
        if (davidGroup.stringLeft) {
            const localFreeStringPos = davidGroup.sling.worldToLocal(davidGroup.freeStringWorldPos.clone());
            const posLeft = davidGroup.stringLeft.geometry.attributes.position.array;
            // extremity of the string is attached to the hand or not
            posLeft[0] = localFreeStringPos.x;
            posLeft[1] = localFreeStringPos.y;
            posLeft[2] = localFreeStringPos.z;

            // extremity of the string is attached to the pocket
            posLeft[3] = localLeftEnd.x;
            posLeft[4] = localLeftEnd.y;
            posLeft[5] = localLeftEnd.z;
            davidGroup.stringLeft.geometry.attributes.position.needsUpdate = true;
        }

        // Right String
        if (davidGroup.stringRight) {
            const posRight = davidGroup.stringRight.geometry.attributes.position.array;
            posRight[3] = localRightEnd.x;
            posRight[4] = localRightEnd.y;
            posRight[5] = localRightEnd.z;
            davidGroup.stringRight.geometry.attributes.position.needsUpdate = true;
        }
    }
}