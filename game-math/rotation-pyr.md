# 회전 Pitch · Yaw · Roll: 이름은 같고, 축 글자와 순서가 다르다

> GameMathLab · 과정 1 · 회전 · 2026-10-28 — 미사일을 직접 돌려 보는 그림은 [rotation-pyr.html](rotation-pyr.html)

**Pitch(끄덕)·Yaw(도리도리)·Roll(갸우뚱)은 물체 자신을 기준으로 한 동작 이름이라 두 엔진에서 뜻이 같다. 다른 건 ① 축 글자, ② 에디터와 코드의 칸 순서, ③ Pitch의 부호.**

## 이름은 물체 기준 동작

| 이름 | 동작 | 도는 축 (물체 기준) | 언리얼 | 유니티 |
|---|---|---|---|---|
| Yaw | 도리도리 | 위 축 | Z | Y |
| Pitch | 끄덕끄덕 | 옆 축 | Y | X |
| Roll | 갸우뚱 | 앞 축 | X | Z |

- 언리얼은 Z가 위, X가 앞. 유니티는 Y가 위, Z가 앞

## 칸 순서

| | 첫째 | 둘째 | 셋째 |
|---|---|---|---|
| 언리얼 코드 `FRotator(…)` | Pitch | Yaw | Roll |
| 언리얼 Details X / Y / Z | Roll | Pitch | Yaw |
| 유니티 코드 `Quaternion.Euler(x, y, z)` | Pitch | Yaw | Roll |
| 유니티 인스펙터 X / Y / Z | Pitch | Yaw | Roll |

- 언리얼은 Details(축 순서)와 코드(Pitch-Yaw-Roll)가 어긋남 (Epic 공식)

```
// 미사일 수직 발사
Details:  X(Roll)=0   Y(Pitch)=90   Z(Yaw)=0
코드:     FRotator(90.f, 0.f, 0.f)     // (Pitch, Yaw, Roll)
```

## 부호

| | 언리얼 | 유니티 |
|---|---|---|
| Pitch +90 | 위를 봄 (Epic 공식) | 아래를 봄 |
| Yaw +90 | 오른쪽으로 | 오른쪽으로 |

- 유니티 감각("아래를 보려면 +90")으로 쓰면 언리얼에선 위로 감
- Roll의 부호는 확인하지 않음
- 값으로 확인: `GetActorForwardVector()`의 Z가 +1이면 위, −1이면 아래

## 도와 라디안

| 함수 | 단위 | 이번에 쓴 곳 |
|---|---|---|
| `FRotator(Pitch, Yaw, Roll)` | 도 | 수직 발사 |
| `AddActorLocalRotation(FRotator(…))` | 도 | 터렛 제자리 회전 |
| `RotateAngleAxis(각도, 축)` | 도 | 레이더 경계선 |
| `FQuat(축, 각도)` | 라디안 | 미사일 유도 |

- 외적으로 구한 임의의 축으로 돌릴 때는 Pitch·Yaw·Roll로 나누기 어려워서 `FQuat`

## 더 보기

- [타겟 쪽으로 돌기](homing-turn.md)
- [내적은 숫자, 외적은 화살표](dot-cross.md)
- [레이더 원뿔 판정](radar-cone.md)
- [2026-10-28 개발 일지](../gamemathlab/devlog/2026-10-28-GameMathLab.md)
