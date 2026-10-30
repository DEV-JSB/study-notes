# 언리얼 함정 모음

> Unreal · UE 5.4 · 겪을 때마다 한 줄씩 — 그림 버전은 [pitfalls.html](pitfalls.html)
>
> 처음 떠오르는 건 정답이 아니라 **증상**이라서, 증상으로 찾을 수 있게 모은다. 증상 → 처음 의심 → 원인 → 해결.

## 증상으로 찾기

| 이런 일이 생기면 | 여기부터 |
|---|---|
| 컴파일도 되고 함수도 맞는데 이벤트 함수가 안 불린다 | 생성자에서 AddDynamic |
| 헤더에 추가한 UPROPERTY가 Details에 안 보인다 | 헤더 변경과 Live Coding |
| Details에서 값을 바꿔도 반영이 안 된다 | 생성자는 Details 값보다 먼저 돈다 |
| 액터가 도는데 방향 벡터는 안 돈다 | FVector::ForwardVector는 상수 |
| 각도 판정이 항상 true / 엉뚱한 쪽을 잡는다 | 도·라디안·cos 섞기 |
| Overlap 이벤트가 안 일어난다 / Presets에 만든 채널이 없다 | 충돌 |
| 델리게이트에 연결할 함수의 매개변수를 모르겠다 | ~Params 매크로 읽기 |
| `No viable operator=` 긴 에러 | 부모 포인터 → 자식 변수 |
| `Cannot resolve symbol 'override'` | override 위치 |
| UE_LOG가 컴파일 안 되거나 글자가 깨진다 | TEXT() 괄호와 * |
| 에셋이 LFS로 들어가는지 모르겠다 | .gitattributes |
| PIE 중 Details의 값이 안 바뀐다 | Details는 실시간이 아니다 |
| 뼈·소켓 위치가 엉뚱하게 캐릭터 발밑 중앙이다 | 없는 소켓 이름 |
| 빌드 에러 `MSB4019 … Rider … VC\v180 … 찾을 수 없습니다` | Rider의 MSBuild 선택 |

## 생성자에서 `AddDynamic` → 조용히 안 불림

- **증상**: Overlap 함수 내용도 맞고 컴파일도 되는데 로그가 안 뜬다
- **처음 의심**: 헤더를 Live Coding으로 반영해서 → 풀 빌드로 실험 → 그래도 안 됨 → 기각
- **원인**: `AddDynamic`을 **생성자**에서 했다. 연결 정보가 BP 에셋에 같이 저장되고, 레벨의 터렛에선 제대로 안 살아났다 (엔진 내부의 정확한 단계는 확실치 않음)
- **해결**: `BeginPlay`로 옮김 (커뮤니티 표준)
- 함수가 맞는 것과 함수가 불리는 것은 별개: ① 겹침이 일어나나 → ② 내 함수에 연결됐나 → ③ 함수 내용
- 가설 하나에 실험 하나. 한 번에 여러 개를 고치면 원인을 모른다

## 헤더 변경과 Live Coding

- **증상**: 헤더에 추가한 `UPROPERTY`가 Details에 없다. Output Log에 `Live coding failed`
- **원인**: 마지막 진짜 빌드(`.dll`)보다 헤더가 나중에 바뀌었고, 반영은 Live Coding 패치로만 됐다
- **해결**: 에디터를 끄고 IDE에서 빌드, `.dll` 시간 확인
- Epic 공식: 재인스턴싱이 켜져 있으면 큰 변경도 반영하려고 한다. "헤더 바꾸면 끄고 빌드"는 **안전한 선택(커뮤니티 표준)**이지 규칙이 아니다
- 안 될 때는 Output Log의 빨강·노랑 줄부터

## 생성자는 Details 값보다 먼저 돈다

- **증상**: Details에서 `DetectRadius`/`DetectDeg`를 바꿔도 그대로
- **처음 의심**: float이 초기화 전 → 아님. `float X = 90.f;`는 생성자 본문보다 먼저 들어간다
- **순서**: ① C++ 기본값 → ② 생성자 → ③ Details 값 → ④ `OnConstruction` → ⑤ `BeginPlay`
- **해결**: Details 값을 쓰는 계산은 `OnConstruction` 또는 `BeginPlay` (Epic 공식)
- `InitSphereRadius`는 생성자 전용, 그 외엔 `SetSphereRadius`
- 값은 한 곳에서만 (single source of truth)

## `FVector::ForwardVector`는 언제나 (1, 0, 0)

- **원인**: static 상수. `GetLocation().ForwardVector`처럼 아무 벡터 뒤에 붙여도 컴파일되고 월드 X축이 나온다
- **해결**: `GetActorForwardVector()` / `GetActorRightVector()` / `GetActorUpVector()`

## 도·라디안·cos 섞기

- **증상**: 원뿔 판정이 전부 true, 또는 정면을 못 잡고 옆을 잡음
- **원인**: cos 값을 도와 비교 / cos를 라디안으로 착각 / Cos 빠뜨림 / 부등호 반대 / `Abs`
- **해결**: `DetectCos = FMath::Cos(FMath::DegreesToRadians(DetectDeg));` → `DetectCos <= Result`

| 함수 | 단위 |
|---|---|
| `FMath::Cos`, `FQuat(Axis, Angle)` | 라디안 |
| `RotateAngleAxis(AngleDeg, Axis)`, `FRotator` | 도 |
| `DotProduct` 결과 (길이 1끼리) | 각도 아님, cos 값 |

- 손 계산 검증: 정면 1, 옆 0, 뒤 -1. 값은 두세 개 (45°에선 0.785와 0.707이 우연히 비슷)
- 그림: [레이더 원뿔 판정](../game-math/radar-cone.md)

## 충돌: Preset ≠ Object Channel, 반응은 약한 쪽

- 새 채널은 Presets 목록이 아니라 **Custom... → Object Type**에 있다
- 반응은 둘 중 약한 쪽: Ignore < Overlap < Block (Epic 공식)
- 양쪽 다 Generate Overlap Events, 이벤트는 게임이 돌 때만 (Play 중 F8로 빠져나와 옮기기)
- C++에선 번호(`ECC_GameTraceChannel1`). `DefaultEngine.ini`의 `Name="Target"`에서 확인, `#define ECC_Target ECC_GameTraceChannel1`, `DefaultEngine.ini` 커밋 필수

## 델리게이트 매개변수: `~Params` 매크로 읽기

```cpp
DECLARE_DYNAMIC_MULTICAST_SPARSE_DELEGATE_FourParams(
    FComponentEndOverlapSignature, UPrimitiveComponent, OnComponentEndOverlap,   // 이름표 3개
    UPrimitiveComponent*, OverlappedComponent,   // 쌍 1
    AActor*, OtherActor,                         // 쌍 2
    UPrimitiveComponent*, OtherComp,             // 쌍 3
    int32, OtherBodyIndex);                      // 쌍 4
```

- `FourParams` = 쌍 4개. 자료형과 순서는 정확히, 이름은 자유. 함수엔 `UFUNCTION()`
- Begin은 `SixParams` (`bFromSweep`, `SweepResult` 추가)

## 부모 포인터 → 자식 변수

- `CreateDefaultSubobject<UShapeComponent>`(자동완성 실수)를 `TObjectPtr<USphereComponent>`에 넣으려 함
- 긴 에러는 첫 줄만: 왼쪽(변수)과 오른쪽(값)의 자료형 비교

## `override`는 뒤에

```cpp
virtual void OnConstruction(const FTransform& Transform) override;
```

- `.cpp` 정의엔 `virtual`/`override` 없이, 첫 줄 `Super::OnConstruction(Transform);`

## `UE_LOG`: `TEXT()`는 글자만, `FString`엔 `*`

```cpp
UE_LOG(LogTemp, Warning, TEXT("Enter(%s)"), *Other->GetName());
```

- 화면: `if (GEngine) { GEngine->AddOnScreenDebugMessage(키, 초, 색, 문자열); }` + `#include "Engine/Engine.h"` (IWYU)

## `.gitattributes`에 LFS 규칙이 없었다

- GitHub 기본(`* text=auto`)뿐이었음 → `*.uasset`/`*.umap`/바이너리 LFS 규칙 + `git lfs install`
- 확인: `git check-attr filter -- <파일>` → `filter: lfs`, add 후 `git lfs status`

## PIE 중 Details는 실시간이 아니다

- **증상**: BP가 매 Tick 값을 넣는데, PIE 중 Details의 숫자가 처음 값 그대로다 (2026-10-30, `BP_PaperField`의 User Parameters)
- **처음 의심**: Tick이 한 번만 돈다 / 연결이 BeginPlay 줄에 붙었다
- **원인**: Details 패널이 PIE 중 값을 매 프레임 다시 그리지 않음. 값은 실제로 바뀌고 있었다
- **해결**: Outliner에서 다른 액터를 눌렀다가 다시 선택하면 갱신됨. 확실히 보려면 `Print String`(Key 고정, Duration 0)이나 화면 로그로
- 화면에 보이는 값이 안 바뀐다 ≠ 값이 안 바뀐다. 가설을 셋 세우고 하나씩 지웠다

## 없는 소켓 이름은 조용히 틀린다

- **증상**: `GetSocketLocation` 결과가 뼈가 아니라 메시 컴포넌트 위치(캐릭터 발밑 중앙)
- **원인**: 이름이 틀리면 에러 없이 컴포넌트 위치를 돌려준다
- **해결**: BeginPlay에서 `DoesSocketExist(BoneName)`로 확인하고 로그. 뼈 이름도 이걸로 확인된다 (`PaperToucherComponent`)
- 뼈 이름은 메시 → Skeleton 탭 → Skeleton Tree에서 (`foot_l`, `foot_r`)

## Rider의 MSBuild 선택

- **증상**: `MSB4019 … JetBrains Rider 2026.2 … \tools\MSBuild\Microsoft\VC\v180\Microsoft.Cpp.Default.props을 찾을 수 없습니다`
- **원인**: Rider가 VS 2022 대신 **자기 번들 MSBuild**로 빌드 → v180을 찾음. VS 2022에는 v170까지, UE 5.4는 VS 2022(v170)
- **해결**: Rider Settings → Build, Execution, Deployment → Toolset and Build → MSBuild version = `C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe`
- 코드 에러가 아니라 도구 에러. Intermediate 지우기·VS 재설치부터 하지 않기

## 작은 것들

- Pawn = Controller(Player 또는 AI)가 조종. 조종 안 하면 Actor. BP 부모는 편집기 오른쪽 위 `Parent class:`
- `FRotator`는 (Pitch, **Yaw**, Roll). Yaw/Pitch/Roll = Z/Y/X가 경첩
- Yaw 표시는 180 다음 -180
- 지역 변수도 PascalCase, bool은 `b`, UPROPERTY엔 초기값
- 남의 액터는 `TWeakObjectPtr`, 꺼낼 때 `IsValid()`
- C++ 클래스 생성 시 `A` 빼고 입력, 이름은 신중히
- include 에러: 철자 → 폴더 → 모듈
