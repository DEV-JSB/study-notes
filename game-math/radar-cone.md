# 레이더 원뿔 판정: 그림자가 기준보다 길면 안이다

> GameMathLab · 과정 1 · 레이더 터렛 · 2026-10-25 — 직접 돌려 보는 그림은 [radar-cone.html](radar-cone.html)

**타겟 방향과 터렛 정면을 둘 다 길이 1로 맞춰 내적한 값(그림자 길이)이 `cos(반폭)`보다 크거나 같으면 원뿔 안.**

## 코드

```cpp
// BeginPlay — 기준값은 한 번만 (Details 값이 다 들어온 뒤)
DetectCos = FMath::Cos(FMath::DegreesToRadians(DetectDeg));

// CheckFireTarget
FVector TargetDir = Actor->GetActorLocation() - GetActorLocation();   // 떼어내기
FVector TargetDirNormalized = TargetDir.GetSafeNormal();              // 늘이고 줄이기 (길이 1)
float Result = FVector::DotProduct(TargetDirNormalized, GetActorForwardVector());  // 그림자
return DetectCos <= Result;
```

## 도 → 라디안 → cos

| 무엇 | 정체 | 학교 수학 |
|---|---|---|
| 도 ↔ 라디안 | 같은 각도의 두 단위. `FMath::Cos`가 라디안만 받아서 바꿀 뿐 | 고등 수학Ⅰ 호도법 |
| cos | 각도가 **아니라** 그림자 길이(비율). -1 ~ 1 | 중3 삼각비 |
| 내적 (길이 1끼리) | 두 화살표 사이의 그림자 길이 = cos θ. 곱하고 더하기만 함 | — |

- 45° → 0.785 rad → cos **0.707**
- 60° → 1.047 rad → cos **0.5**
- **45°의 함정**: 라디안(0.785)과 cos(0.707)가 우연히 비슷해서 cos를 빼먹어도 맞아 보인다. 값은 두세 개로 검증

## 손 계산 검증 (desk check)

| 타겟과 정면 사이 | Result (cos) | 반폭 45° (기준 0.707) | 반폭 60° (기준 0.5) |
|---|---|---|---|
| 0° 정면 | 1.000 | 안 | 안 |
| 40° | 0.766 | 안 | 안 |
| 50° | 0.643 | 밖 | 안 |
| 60° | 0.500 | 밖 | 안 (경계) |
| 90° 옆 | 0.000 | 밖 | 밖 |
| 180° 뒤 | -1.000 | 밖 | 밖 |

- 각도가 작을수록 cos는 커진다 → "안"은 기준보다 **크거나 같다**
- 부등호가 헷갈리면 정면(1)을 넣어 true가 나오는지만 본다

## 좌우 대칭

- cos(-50°) = cos(50°). 내적은 **얼마나 벌어졌나**만 알고 **어느 쪽인지**는 모른다
- 높이(Z)를 지우지 않았으니 위·아래·대각선도 같다 → 정면 축을 둘러싼 **동그란 원뿔**
- 좌우를 알려면 **외적** → 연습 2(맞은 방향), 미사일 꺾기

## 경계선 그리기

```cpp
const FVector PlusEdge  = Forward.RotateAngleAxis( DetectDeg, FVector::UpVector);
const FVector MinusEdge = Forward.RotateAngleAxis(-DetectDeg, FVector::UpVector);
```

| 경계 | 회전 | 경첩(축) |
|---|---|---|
| 좌우 | Yaw | 위 Z (`FVector::UpVector`) |
| 위아래 | Pitch | **터렛의** 오른쪽 `GetActorRightVector()` |

- `RotateAngleAxis`는 **도(°)**, 새 벡터 반환, 길이·원본 그대로. `FQuat(Axis, Angle)`은 라디안
- 빨강(+)이 왼쪽인지 오른쪽인지는 에디터에서 **보고 확인한 뒤** 이름 짓기 (왼손 좌표계)
- `FVector::ForwardVector` / `RightVector`는 월드 상수. 도는 터렛은 `GetActorForwardVector()` / `GetActorRightVector()`

## 더 보기

- [내적은 그림자 길이다](dot-product.md)
- [벡터 더하기·빼기·곱하기](vector-ops.md)
- [언리얼 함정 모음](../unreal/pitfalls.md)
- [2026-10-25 개발 일지](../gamemathlab/devlog/2026-10-25-GameMathLab.md)
