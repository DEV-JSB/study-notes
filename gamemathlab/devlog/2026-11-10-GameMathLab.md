# 2026-11-10 개발 일지

> GameMathLab (UE 5.4, C++) · 게임 수학 상설 연습장 · **과정 2 시작: 시간과 프레임 (dt)** — TBH(Unity)에서 겪은 fps 의존 버그를 언리얼로 재현하고 고치기 (11-09 저녁 ~ 11-10)

## 오늘 한 것

- **과정 2를 열었다** — TBH에 30·45·60 fps 옵션이 있는데, 게임 로직이 UniTask로 0.002초 대기를 반복하고 있었다. 대기는 한 프레임보다 짧을 수 없어서 사실상 **프레임마다 1번** 돌았고, fps 옵션에 따라 결과가 달라졌다. 이걸 언리얼에서 직접 짜서 화면으로 보고 고치기로 함
- **레벨** `Content/FrameRateDependentLogicLevel/FrameLevel` (폴더 이름과 맵 이름이 다름 — 그대로 둠)
- **1단계: 언리얼 UI 첫 경험** — `WBP_FpsSwitcher` (Widget Blueprint)에 버튼 30·45·60. 클릭하면 `Execute Console Command`로 `t.MaxFPS 30/45/60`. Level Blueprint `Event BeginPlay`에서 `Create Widget` → `Add to Viewport` + `Set Show Mouse Cursor`. `stat fps`로 값이 바뀌는 걸 확인
- **2단계: 버그 재현** — C++ 액터 `AFpsTest` (BP 없이 레벨에 직접 배치). 체력·데미지·간격(0.002초)·경과 시간·실행 횟수를 들고, Tick마다 "마지막 데미지 시각 + 간격을 넘었으면 1번" → TBH와 같은 **Tick 1번 = 데미지 1번**
- **3단계: 보정** — `bUseTimeCorrection` (bool)을 켜면 "이번 프레임 시간 + 지난 나머지"를 간격으로 나눠 **몫만큼** 데미지를 주고 **나머지는 다음 Tick으로** 넘김. bool을 바꾸면 자동 리셋
- **fps 버튼 → 리셋 연결** — 위젯 `Event Construct`에서 `Get Actor Of Class(FpsTest)`를 변수 `FpsTestActor`에 저장, 버튼 세 개의 실행선을 `Is Valid` 하나로 모아 `ResetTest`
- **체력바** — Progress Bar `HealthBar`, 위젯 `Event Tick`에서 `Get Health Percent` → `Set Percent`. 앵커는 위쪽 가로 늘이기
- **측정 구간** `TestTime` — 정해진 시간 동안만 데미지를 처리
- **발견** — 간격이 0.02초면 30fps와 60fps의 실행 횟수가 **같아진다**. TBH에서 본 증상이 이것 (아래 티키타카)
- 커밋 (작업자): `c3bccae` 과정 2 시작 · `0c1aaab` 버그 재현 + 몫·나머지 보정 · `9901049` 체력바 + TestTime

## 결과

### MaxHealth 100, 간격 0.002초 (의도: 1초에 500번 → 0.2초에 사망)

| KillTime | 30fps | 45fps | 60fps |
|---|---|---|---|
| 고장 (Tick마다 1번) | 3.317 | 2.233 | 1.672 |
| 고침 (몫만큼 + 나머지 넘기기) | 0.217 | 0.211 | 0.206 |

- 고장: 100 ÷ fps와 거의 같다 (예상 3.333 / 2.222 / 1.667). 30과 60의 비율 1.98 ≈ 2배
- 고침: 오차 0.017 / 0.011 / 0.006이 모두 **1프레임**(0.033 / 0.022 / 0.017) 안쪽 → 남은 오차는 "체력이 0이 된 걸 프레임 경계에서만 알아챈다" 하나뿐. fps가 낮을수록 오차가 큰 것도 이걸로 설명됨

### MaxHealth 1000, Damage 2, TestTime 3초, 고장 모드

| | 30fps | 60fps |
|---|---|---|
| DamageCount | 90 | 178 |
| 남은 체력 | 820 (= 1000 − 90 × 2) | 644 (= 1000 − 178 × 2) |

- 3초 × fps = 90 / 180. 60이 178인 건 끝나는 순간도 프레임 경계라서 (`ElapsedTime`이 2.98에서 멈춤)

## 최종 코드

### `FpsTest.h`

```cpp
UCLASS()
class GAMEMATHLAB_API AFpsTest : public AActor
{
	GENERATED_BODY()

public:
	AFpsTest();

public:
	UFUNCTION(BlueprintCallable)
	void ResetTest();

	UFUNCTION(BlueprintPure)
	float GetHealthPercent() const;

public:
	UPROPERTY(EditAnywhere)
	int MaxHealth = 100;

	UPROPERTY(EditAnywhere)
	int Damage = 1;

	UPROPERTY(EditAnywhere)
	float TestTime = 10.0f;

	UPROPERTY(BlueprintReadOnly)
	int Health = 100;

	UPROPERTY(BlueprintReadOnly)
	float HealthZeroTime = 0.0f;

	UPROPERTY(EditAnywhere)
	bool bUseTimeCorrection = false;

	UPROPERTY(EditAnywhere)
	float DamageInterval = 0.002f;

	float TimeSinceLastDamage = 0.0f;

	float RemainTimeLastDamage = 0.0f;

	UPROPERTY(BlueprintReadOnly)
	int DamageCount = 0;

	UPROPERTY(BlueprintReadOnly)
	float ElapsedTime = 0.0f;

	bool bLastUseTimeCorrection = false;

protected:
	virtual void BeginPlay() override;

public:
	virtual void Tick(float DeltaTime) override;
};
```

### `FpsTest.cpp`

```cpp
#include "FpsTest.h"

AFpsTest::AFpsTest()
{
	PrimaryActorTick.bCanEverTick = true;
}

void AFpsTest::ResetTest()
{
	ElapsedTime = 0.0f;
	TimeSinceLastDamage = 0.0f;
	DamageCount = 0;
	Health = MaxHealth;
	HealthZeroTime = 0.0f;
	RemainTimeLastDamage = 0.0f;
}

float AFpsTest::GetHealthPercent() const
{
	const float result = Health / static_cast<float>(MaxHealth);
	return result;
}

void AFpsTest::BeginPlay()
{
	Super::BeginPlay();
	ResetTest();
}

void AFpsTest::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	ElapsedTime += DeltaTime;

	if (TestTime <= ElapsedTime)
	{
		return;
	}

	if (bUseTimeCorrection != bLastUseTimeCorrection)
	{
		ResetTest();
		bLastUseTimeCorrection = bUseTimeCorrection;
	}

	if (bUseTimeCorrection)
	{
		const float TimeToProcess = DeltaTime + RemainTimeLastDamage;
		const int32 AttackCount = FMath::FloorToInt(TimeToProcess / DamageInterval);
		RemainTimeLastDamage = TimeToProcess - (DamageInterval * AttackCount);
		Health = FMath::Max(0, Health - AttackCount * Damage);
		DamageCount += AttackCount;
	}
	else
	{
		if (ElapsedTime > TimeSinceLastDamage + DamageInterval)
		{
			Health = FMath::Max(0,Health - Damage);
			TimeSinceLastDamage = ElapsedTime;
			++DamageCount;
		}
	}
	if (Health <= 0 && HealthZeroTime <= 0.f)
	{
		HealthZeroTime = ElapsedTime;

		if (GEngine)
		{
			GEngine->AddOnScreenDebugMessage(-1, 100.f, FColor::Red,
				FString::Printf(
					TEXT("NowHealth : %d || ElapsedTime : %.2f || DamageCount : %d || KillTime : %.3f"), Health,
					ElapsedTime, DamageCount,HealthZeroTime));
		}
	}

	if (GEngine)
	{
		GEngine->AddOnScreenDebugMessage(1, 3.f, FColor::Yellow,
			FString::Printf(
				TEXT("NowHealth : %d || ElapsedTime : %.2f || DamageCount : %d || KillTime : %.3f"), Health,
				ElapsedTime, DamageCount,HealthZeroTime));
	}
}
```

### 줄별 (핵심만)

| 줄 | 하는 일 | 수학 |
|---|---|---|
| `ElapsedTime > TimeSinceLastDamage + DamageInterval` | (고장) 마지막 데미지 시각 + 0.002를 넘었나. 한 프레임(0.017~0.033)이 0.002보다 길어서 **매 Tick 참** | 비교 |
| `TimeSinceLastDamage = ElapsedTime` | (고장) 마지막 시각을 **지금**으로 → 넘친 시간(나머지)을 버림 | |
| `TimeToProcess = DeltaTime + RemainTimeLastDamage` | (고침) 이번에 처리할 시간 = 이번 프레임 + 지난번 나머지. 지역 변수라 `ElapsedTime`을 안 건드림 | 더하기 |
| `FMath::FloorToInt(TimeToProcess / DamageInterval)` | (고침) 그 안에 0.002초가 몇 개 들어 있나 | 나눗셈의 **몫** (버림) |
| `TimeToProcess - (DamageInterval * AttackCount)` | (고침) 쓰고 남은 시간 → 다음 Tick으로 | 나눗셈의 **나머지** |
| `FMath::Max(0, Health - AttackCount * Damage)` | 몫 × 데미지만큼 깎고 0 아래로는 안 감 | |
| `Health / static_cast<float>(MaxHealth)` | 0~1 비율. 둘 다 int면 정수 나눗셈이라 0이 됨 | |
| `Health <= 0 && HealthZeroTime <= 0.f` | 처음 0이 된 순간 **한 번만** 기록 | |

### 위젯 `WBP_FpsSwitcher` 그래프

| 이벤트 | 노드 순서 |
|---|---|
| `Event Construct` | `Get Actor Of Class` (Actor Class = `FpsTest`) → Return Value를 변수 `FpsTestActor`로 저장 |
| `Button30/45/60` `On Clicked` | `Execute Console Command` (`t.MaxFPS 30` / `45` / `60`) → 세 실행선이 하나의 `Is Valid`(`FpsTestActor`)로 모임 → `Reset Test` |
| `Event Tick` | `Is Valid`(`FpsTestActor`) → `Set Percent` (Target `HealthBar`, In Percent ← `Get Health Percent`) |

## 티키타카 — 질문하고 배운 것

### 내가 세운 계획

> "WaitForSeconds 0.002초마다 수행했던 걸 이제 언리얼에 UI에 카운트를 들고 있고 카운트를 증가시키는 거야. 체력바도 만들어서 … 카운트 증가시킬 때마다 체력바를 줄이는 거지."

- 카운트(1초에 몇 번 실행됐나)를 핵심 값으로 잡은 것, 체력바로 "실제 게임 상황"(지속 피해)을 만든 것 → 맞음
- 고친 곳: **값은 액터가, UI는 보여 주기만** (아래 함정). 비교하려면 **경과 시간**과 **리셋**이 필요
- TBH의 0.002초 대기 루프 = 언리얼에선 **Tick마다 1번**과 사실상 같다 (UniTask가 다음 프레임에 깨어나서)

### 2단계 계획 — 처음 낸 아이디어가 이미 고친 쪽에 반쯤 가 있었다

> "한 프레임의 시간값을 누적해서 더한 다음, 더한 값이 0.002초를 넘어섰으면 수행시키고 또 그 다음 실행해야 하는 조건의 시간을 현재 시간 + 0.002초로 만든다"

- `if`로 한 번만 실행하면 **TBH 버그를 정확히 재현**한다 (매 Tick 조건이 참이지만 1번만)
- 설명 안에 "누적값" 방식과 "예약 시각" 방식이 섞여 있었음 → 하나만 고름 (예약 시각)
- 3단계에서 보니 `if`를 **몫**으로 바꾸고 **나머지를 남기기만** 하면 고친 버전이었다

### 3단계 계획 — 지난 시간을 간격으로 나눠서 몫만큼?

> "사실상 지난 시간에 DamageInterval을 나눠서 몫만큼 데미지를 줘야 하나?"

- **맞음.** 30fps면 0.0333 ÷ 0.002 = 16.67 → 16번
- 빠진 것: **나머지를 버리면 여전히 틀린다** (프레임 시간이 일정하다고 가정한 계산)

| fps | 한 프레임 | ÷ 0.002 | 몫 | 1초에 (몫만 쓰면) |
|---|---|---|---|---|
| 30 | 0.0333 | 16.67 | 16 | 480 |
| 45 | 0.0222 | 11.11 | 11 | 495 |
| 60 | 0.0167 | 8.33 | 8 | 480 |

- 목표는 500. 나머지를 **다음 Tick으로 넘겨야** 잃어버리는 시간이 없다. 이게 게임 루프의 **누적기(accumulator)** 패턴 (커뮤니티 표준, Glenn Fiedler "Fix Your Timestep")
- 미사일(10-27)의 "속도 × DeltaTime"과 같은 생각: 이번 프레임에 흐른 시간만큼 일한다. 거리처럼 **연속적인 양**은 곱하기로 끝나고, 데미지처럼 **띄엄띄엄 일어나는 사건**은 몫 + 나머지가 필요

### Q. 딱 수치가 정확하게 맞아떨어질 순 없겠지, Delta도 결국 소수이고 정확하지 않으니까

| 원인 | 무엇 | 크기 (2초 기준) |
|---|---|---|
| ① 프레임 경계에서만 확인 | 체력이 0이 된 순간이 프레임 사이에 있어도 다음 Tick에서야 앎 | 최대 1프레임 — **가장 큼** |
| ② 프레임 시간이 흔들림 | `t.MaxFPS 30`이어도 실제 DeltaTime은 0.0331, 0.0338…처럼 매번 다름 | ①이 어느 프레임에 걸릴지를 바꿈 |
| ③ float 소수 오차 | 0.002는 2진수로 딱 안 떨어짐 | 수십억분의 1초 — 여기선 무시 |

- "Delta가 정확하지 않다"(②)는 맞고, "소수라서"(③)는 아주 작다. 가장 큰 건 ①
- **고친 버전은 ②가 있어도 총량이 안 틀린다.** DeltaTime을 전부 넣고 남은 건 넘기니까. 남는 오차는 "언제 알아채나" 하나뿐 → 결과 표에서 오차가 모두 1프레임 안쪽인 것으로 확인
- ③은 `ElapsedTime`처럼 계속 커지는 float에서 몇 시간 뒤 진짜 문제가 됨 (서버를 오래 켜 두는 게임)

### Q. 체력 2000 기준인데 bool 켜고 안 켜고 차이가 이렇게 심해? 안 켜면 66.666초, 켜면 4초대

| | 1초에 데미지 | 2000 깎는 데 |
|---|---|---|
| 의도 (0.002초마다) | 500 | 4초 |
| 고장 60fps | 60 | 33.3초 |
| 고장 30fps | 30 | 66.7초 |

- 66.7 ÷ 4 = 16.7배 = 500 ÷ 30. 고장 버전은 "30과 60이 2배 차이"만 있는 게 아니라 **어떤 fps에서도 의도보다 8~17배 느렸다**
- 0.002초(1초에 500번)는 **어떤 fps보다도 촘촘**해서 기획한 숫자가 한 번도 그대로 돈 적이 없다
- **TBH로 돌아가면**: 밸런스는 아마 "실제로 돌던 모습"을 보고 맞춰졌을 것. 이걸 "제대로" 고치면 60fps 기준으로 갑자기 8배 빨라진다 → 고치기 전에 **"숫자 0.002가 의도였나, 지금까지 보던 느낌이 의도였나"**부터 정해야 한다. 수학이 아니라 판단

### Q. 10초 기준이면 0.002초니까 30이랑 60이 수행 횟수·체력이 같아야 하는 거 아냐? — 간격에 따라 예기치 못하게 동작한다

> "시간값이 0.002초라서 그랬구나 … 딱 애매하게 0.02초여야 내가 말한 문제점이 드러나는 시간이었네"

**"간격마다 기다렸다가 1번" 로직은 기획한 대로 흘러가지 않는다.** 프레임 경계에서만 깨어나기 때문에, 몇 프레임마다 1번 실행될지는 "간격 안에 프레임이 몇 개 들어가야 넘기나" = **올림**으로 정해진다. 그래서 **간격 값에 따라 틀리는 모양 자체가 달라진다.**

간격 0.002초 (의도: 1초에 500번) — **fps에 정비례**, 버그가 눈에 잘 띔

| fps | 한 프레임 | 몇 프레임마다 1번 | 1초에 |
|---|---|---|---|
| 30 | 0.033 | 1 | 30 |
| 45 | 0.022 | 1 | 45 |
| 60 | 0.017 | 1 | 60 |

간격 0.02초 (의도: 1초에 50번) — **계단 모양**, 30과 60이 같아서 "문제없어 보임" (예상값, 아직 실측 안 함)

| fps | 한 프레임 | 0.02를 넘기려면 | 몇 프레임마다 1번 | 1초에 |
|---|---|---|---|---|
| 30 | 0.033 | 1프레임이면 넘김 | 1 | **30** |
| 45 | 0.022 | 1프레임이면 넘김 (아슬아슬) | 1 | **45** |
| 60 | 0.017 | 1프레임으론 부족, 2프레임 | 2 | **30** |

- 30과 60만 비교하면 같아서 버그가 숨는다. 그 사이의 45만 튀고, **셋 다 의도(50)와 다르다**
- 45fps는 한 프레임(0.0222)이 0.02보다 아주 조금만 길어서, 프레임이 흔들리면 가끔 건너뛸 수 있다 → 더 들쭉날쭉
- 정리: **고장 = 올림** (몇 프레임이 있어야 넘나), **고침 = 버림(몫) + 나머지**
- TBH에서 "30이랑 60 수행 횟수가 같다"고 본 게 이것. `DamageInterval`이 `EditAnywhere`라 Details에서 0.02로 바꾸면 코드 수정 없이 확인 가능

### Q. 시간당 수행 횟수로 봐야 정확하겠네

| 보는 값 | 알려 주는 것 | 고장 | 고침 |
|---|---|---|---|
| 시간당 실행 횟수 | **증상** — 의도대로 도나 | 30 / 45 / 60 (다름) | 500 / 500 / 500 (같음) |
| 프레임당 실행 횟수 | **원인** — 왜 그렇게 되나 | 1 / 1 / 1 (같음) | 16.7 / 11.1 / 8.3 (다름) |

- 게임 규칙은 "1초에 몇 번"처럼 **시간으로 정의**되니까 판단 기준은 시간당 횟수
- 두 줄이 정확히 뒤집혀 있다: 고장은 프레임당을 고정해서 시간당이 흔들리고, 고침은 프레임당을 흔들리게 두고 시간당을 고정한다

### Q. `t.MaxFPS 30` — `=` 안 붙이고 이게 돼?

- 콘솔 명령은 **`이름 값`을 띄어쓰기로** (Epic 공식). `t.MaxFPS`만 치면 현재 값 출력, `t.MaxFPS ?`는 설명
- `=`는 `.ini` 파일에 적을 때 (`[SystemSettings]` 아래 `t.MaxFPS=30`)
- 확인: `stat fps` (플레이 중 `` ` `` 키로 콘솔). 한/영 키 주의

### Q. 언리얼은 UI를 동적으로 생성해? 유니티는 씬에 박혀 있는데, 사실 유니티도 생성하는데 뷰만 그렇게 보이는 건가?

- **반은 맞음.** 유니티 씬 파일도 "무엇을 만들지" 적은 레시피라 로드할 때 Canvas까지 실제로 만든다. 다만 에디트 모드에서 보이는 것도 흉내가 아니라 **진짜 객체**
- 언리얼 레벨에는 **Actor만** 놓을 수 있고, UMG 위젯은 Actor가 아니라 **플레이어 화면**에 붙는다 (Epic 공식). 화면 분할이면 플레이어마다 HUD가 따로 필요하니까 → `Create Widget`에 Owning Player 핀

| 하는 일 | 유니티 | 언리얼 |
|---|---|---|
| UI 설계도 | UI 프리팹 | Widget Blueprint |
| 만들기 | `Instantiate` | `Create Widget` |
| 화면에 붙이기 | Canvas 밑에 `SetParent` | `Add to Viewport` |
| 월드 안에 떠 있는 UI | World Space Canvas | Actor의 Widget Component |

- 지금은 Level Blueprint에서 띄움. 실제 게임에선 PlayerController나 HUD 클래스에서 만드는 게 일반적 (커뮤니티 표준)

### Q. 버튼이 너무 작은데 보통 Scale로? 유니티처럼 width, height는?

- 부모가 Horizontal Box면 크기는 부모가 정해서 칸이 없다 = 유니티 Layout Group 안의 자식 (Epic 공식: 크기·위치는 부모 **Slot**이 결정)
- 방법: 상자(Canvas Panel Slot)의 Size X/Y를 키우고 버튼은 Size **Fill**
- Scale은 그림만 키우고 레이아웃은 원래 크기로 계산 → 겹침 (아래 함정)

### Q. 앵커를 골랐는데 유니티처럼 쫙쫙 늘어나지 않네

| 하는 일 | 유니티 | 언리얼 |
|---|---|---|
| 앵커만 바꾸기 | 클릭 | 클릭 |
| 위치·크기도 맞추기 | **Alt** + 클릭 | **Ctrl** + 클릭 |
| 피벗도 맞추기 | Shift + 클릭 | Shift + 클릭 (Alignment) |

- 늘어나는 앵커는 프리셋 오른쪽 줄(가로)·아래 줄(세로)·오른쪽 아래(둘 다). 늘이면 Slot 칸이 Offset Left / Right(양쪽 여백)로 바뀜
- 확인: Designer의 Screen Size를 바꿔 보기

### Q. C 스타일 `(float)`를 쓰니 `static_cast`를 쓰라는데 스타일 맞추라는 건가? 포인터가 아니면 상관없는 거 아님?

- 숫자 값끼리(int → float)는 **결과가 같다.** 이번 줄은 아무거나 써도 됨
- C 스타일 캐스트는 `const_cast` → `static_cast` → `reinterpret_cast`까지 "어떻게든 되게" 시도한다. **포인터·참조**를 잘못 캐스트하면 그대로 통과해서 엉뚱한 메모리를 읽는다 (short 자리를 `int*`로 읽으면 옆 2바이트까지 읽음). `static_cast`는 말이 안 되는 변환을 컴파일 에러로 막아 줌
- 값 캐스트의 손실(3.7 → 3)은 둘 다 못 막는다 → 의도는 `FMath::FloorToInt`처럼 이름으로 (3단계에서 실제로 씀)
- "C 스타일은 안 쓴다" 한 규칙이 매번 판단하는 것보다 실수가 적다 (커뮤니티 표준: C++ Core Guidelines). Epic 엔진 코드에도 C 스타일은 있음
- UObject 포인터는 `Cast<>` (Epic 공식) — 유니티 `as`와 같음
- 유니티에선 왜 몰랐나: C#의 `(float)`는 메모리를 그냥 읽는 캐스트를 허용하지 않는다

### Q. 이 C++를 BP로 만들어야 해?

- 아니. C++ 액터는 Content Browser의 C++ Classes에서 **바로 레벨에 놓을 수 있다** (Epic 공식). 메시가 없어 뷰포트엔 안 보이고 Outliner에만 나옴
- BP 자식이 필요한 때: 에셋(메시·사운드) 지정, 값만 다른 변형 여러 개, 그래프로 로직 덧붙이기 (커뮤니티 표준)

### Q. 위젯이 Health를 읽을 필요가 있나? GetHealthPercent만 받으면 되잖아

- **맞음.** 체력바만 띄우면 0~1 비율 하나로 충분. 위젯에 최소한만 열어 두면 액터 안쪽(예: `Health`를 float로)을 바꿔도 위젯은 안 고친다 (커뮤니티 표준: 캡슐화)

### Q. 실행 노드가 없는 것 — `BlueprintCallable` vs `BlueprintPure`

| 헤더 선언 | 블루프린트 노드 모양 | 연결 |
|---|---|---|
| `UFUNCTION(BlueprintCallable)` | 흰 실행 핀(들어가는 쪽·나가는 쪽)이 붙은 노드 | 실행선 사이에 끼워 넣어야 함 |
| `UFUNCTION(BlueprintPure)` + 함수 끝 `const` | 실행 핀 없는 계산 노드 (값 핀만) | 값 핀만 꽂으면 됨 |

- 처음엔 `GetHealthPercent`를 `BlueprintCallable`로 해서 `Is Valid → Get Health Percent → Set Percent`처럼 실행선 사이에 끼워야 했음 → `BlueprintPure` + `const`로 바꿈
- 언제 Pure: 값을 **읽기만** 하고 아무것도 안 바꿀 때 (Epic 공식: getter는 Pure로 노출하는 게 일반적). 유니티로 치면 메서드 호출 vs getter 프로퍼티
- `const`는 "이 함수는 멤버를 안 바꾼다"는 약속. 실수로 바꾸면 컴파일러가 막음

## 🚨 오늘 걸린 함정 (습관 경보)

- **UI가 게임 값을 들고 있는 설계** — 처음 계획은 UI가 카운트를 들고 증가시키는 것. 위젯을 닫으면 값도 사라지고 로직이 UI에 묶임 → 값은 액터, UI는 표시만 (커뮤니티 표준)
- **글자 표시용으로 Text Box** — Details 이름이 `EditableTextBox_186`. Text Box는 유니티 InputField(입력칸). 보여 주기만 할 땐 **Text Block** (Palette의 COMMON → Text) (Epic 공식)
- **크기를 Scale로 키우기** — 레이아웃은 원래 크기로 계산해서 겹침. Slot의 Size·Padding으로 (커뮤니티 표준)
- **시간 값을 `int`로** — `DamageInterval`(0.002 → 0), `TimeSinceLastDamage`(DeltaTime을 더해도 영원히 0). 시간은 float
- **`int` vs `int32`** — Epic 코딩 표준은 `int32`. 5.4에서 `int` + `BlueprintReadOnly`도 빌드는 통과함 (확인됨)
- **리셋 함수에 Tick 줄이 섞임** — `RestartTest`에 `++DamageCount` (0으로 되돌려야 함), `Health = MaxHealth` 빠짐
- **조건에 엉뚱한 변수** — `if (DamageCount <= 0)` → 바로 위 줄에서 `++DamageCount`라 절대 참이 안 됨. `Health`였어야
- **"처음 한 번만" 빠짐** — 체력이 0으로 머무니까 매 Tick `HealthZeroTime`을 덮어씀 → `HealthZeroTime <= 0.f` 조건 추가. float을 `==` 대신 `<=`로 비교한 건 좋은 습관
- **변수 하나에 뜻 두 개** — 고친 버전에서 `ElapsedTime`을 "전체 경과 시간"과 "이번에 처리할 시간"으로 같이 씀 → 매 Tick 0이 돼서 화면 시간이 0.00. 지역 변수 `TimeToProcess`로 분리
- **"지난 값" 갱신 빠짐** — `bLastUseTimeCorrection`을 안 맞춰서 체크를 켜면 **매 Tick 리셋** (체력이 100에서 꿈쩍 안 함)
- **공통 처리가 한쪽 분기에만** — KillTime 기록이 `else` 안에만 있어서 고친 버전에선 0
- **설정값을 리셋** — `ResetTest`에서 `TestTime = 0` → 첫 Tick부터 return, 아무 일도 안 일어남. 리셋은 "진행하며 바뀌는 값"만
- **`GEngine` 확인 없이 사용** — 한쪽만 `if (GEngine)`
- **디버그 메시지 Key `-1`** — 매 Tick 새 줄 + 3초씩 남음 → 60fps면 180줄. 고정 Key(1)로 한 줄 갱신
- **이름과 내용이 다름** — `TimeSinceLastDamage`는 "지난 시간(길이)"처럼 읽히는데 실제로는 "마지막 데미지 **시각**". `TestTime`도 시각/길이 둘 다로 읽혀서 리셋에 들어간 것 같음

## 결정한 것

- **과정 2 = 시간과 프레임 (dt)** — 새 프로젝트를 따로 만들지 않고 GameMathLab에 (취향 · 바꿔도 됨)
- **레벨·위젯 위치** `Content/FrameRateDependentLogicLevel/`, 위젯 접두사 `WBP_` (커뮤니티 표준)
- **fps 바꾸기는 콘솔 명령** `t.MaxFPS` + `Execute Console Command` 노드 (Epic 공식)
- **위젯은 Level Blueprint에서 띄움** — 빨리 보려고. 나중에 PlayerController/HUD로 옮길 수 있음 (취향 · 바꿔도 됨)
- **값은 C++ 액터, UI는 표시만**. 위젯에 여는 건 `GetHealthPercent`(Pure)와 리셋, 확인용 값 몇 개
- **고장 버전은 "예약 시각" 방식** (`마지막 시각 + 간격`), 고친 버전은 **누적기** (몫 + 나머지)
- **체력은 0에서 멈추고 시간·횟수는 계속** (`FMath::Max`) — 비교는 KillTime과 같은 시간의 횟수로
- **비교는 bool 하나** `bUseTimeCorrection` (`EditAnywhere`), 바뀌면 자동 리셋
- **BP 자식 없이** C++ 액터를 직접 배치
- **체력바 갱신은 위젯 Event Tick** — 값이 매 프레임 바뀌니 Binding이나 이벤트보다 흐름이 보이는 쪽 (취향 · 바꿔도 됨)
- **TestTime 구조는 그대로** — 끝난 뒤 시간이 계속 흐르고 표시가 멈추지만 "테스트 시간만 볼 것"이라 괜찮다고 판단

## 막힌 것 / 미해결

- **0.02초 간격 실측 안 함** — 위 표는 예상값
- **TestTime 이후**: 노란 디버그 글자가 3초 뒤 사라짐(지속 시간 `3.f`), 테스트가 끝난 뒤 bool을 바꾸면 리셋 안 됨 (fps 버튼으로 리셋하면 됨)
- **bool 리셋 검사가 `ElapsedTime += DeltaTime`보다 아래** — 체크를 바꾼 그 Tick만 시간과 데미지가 1프레임 어긋남
- **정리 남음**: `int` → `int32`, `TimeSinceLastDamage` → `LastDamageTime`, `TestTime` → `TestDuration`, `MaxHealth`가 0이면 0으로 나눔, 클래스 이름 `AFpsTest`(FPS = 1인칭 슈팅으로도 읽힘), `Category` 없음
- **TBH 적용 전 판단** — 0.002가 의도였나, 지금 느낌이 의도였나

## 다음에 할 것

- Details에서 `DamageInterval`을 0.02로 바꾸고 3초 측정: 고장 30 / 45 / 60fps가 약 90 / 135 / 90, 고침이 모두 약 150인지
- 좌표계 (11-10 작업자: "좌표계는 내일") — 어떤 장면에서 막힌 건지부터
- 며칠 뒤 빈 파일에서 Claude 없이 "간격마다 실행"을 fps와 상관없게 다시 짜기 (①)

## 성장 점검

- **배웠다의 기준**
  - ① 다시 만들기: 아직
  - ② 바꿔 보기: 일부 — `TestTime`, `KillTime`, 체력바 비율만 받기 등 측정 방법을 스스로 바꿔 가며 붙임. 간격을 바꾸면 결과가 어떻게 되는지는 0.02 실측으로 확인할 차례
  - ③ 설명하기: 일부 — 1프레임 오차, 증상(시간당) vs 원인(프레임당)을 표로 정리함
  - ④ 알아보기: ✅ — 0.002초 실험 결과를 보고 "0.02초여야 내가 말한 문제가 드러난다"며 TBH에서 본 증상(30·60이 같음)을 원리로 다시 설명해 냄
- **쪼개기는 작업자가 먼저** — 화면 구성(fps 버튼 UI, 카운트, 체력바), 재현 로직(시간 누적 → 넘으면 실행), 보정(몫만큼), bool 비교를 작업자가 먼저 냄. Claude가 보충한 건 나머지 넘기기, 지역 변수 분리, 경과 시간·리셋. 처음 "어떻게 하면 좋을까?"로 설계를 한 번 되넘김 → 실마리(Tick 1번 = 0.002 루프 1번) 뒤엔 스스로 계획
- **질문 수준**
  - 4단계(판단 검토): "위젯이 Health를 읽을 필요가 있나, GetHealthPercent만 받으면 되잖아"
  - 3단계(가설 확인): "유니티도 원래 생성하는데 뷰만 그렇게 보이는 건가", "Delta가 소수라 정확하지 않아서", "포인터가 아니면 상관없는 거 아님?", "0.02초여야 드러나는 거였네"
  - 2단계: "이게 맞나?" 여러 번 — 다음엔 "이 줄에서 X가 Y가 될 거라 생각했는데"처럼 **예상한 값**을 같이 붙여 보기
  - 1단계: UI·콘솔·Anchors 같은 처음 보는 엔진 기능 — 자연스러움
- **한 칸 아래 기초**: 나눗셈의 몫과 나머지 (초등 3~4학년), 올림·버림 (초등 5학년 어림하기), 정수 나눗셈 (C++/블루프린트에서 int ÷ int)
- 정리 노트: [간격마다 실행하기 — fps에 묶이지 않게](../../game-math/frame-rate-independence.md)

## 습관 체크

- [x] 새로 만든 것이 연습 폴더에 있다 — `Content/FrameRateDependentLogicLevel/` (맵 이름은 `FrameLevel`로 폴더와 다름)
- [ ] 네이밍 규약을 지켰다 — `bUseTimeCorrection`, `WBP_FpsSwitcher`, `ResetTest`, `TimeToProcess` OK / `int`, `TimeSinceLastDamage`·`TestTime` 이름이 내용과 어긋남
- [x] 눈 말고 값으로 확인했다 — `stat fps`, 화면 디버그 숫자(KillTime·DamageCount), 체력 = 1000 − 횟수 × 2 검산
- [ ] Output Log에 새로 생긴 경고가 없다 — 확인 안 함
