# 유니크가 늘 때마다 if가 쌓인다 — Observer 구독으로 옮기기

> Unity · C# 설계 · 2026-11-23 — 직접 눌러 보는 그림은 [unique-mod-observer.html](unique-mod-observer.html)
>
> 실습 원본: [unity-study / 08.SkillFeatureRefactor](https://github.com/DEV-JSB/unity-study/tree/main/Assets/Chapter/08.SkillFeatureRefactor)

## 발단

회사 프로젝트에는 장비에 붙는 특수 효과(유니크 모드)가 아주 많다. 그런데 새 유니크가 하나 생길 때마다 피해 처리 함수나 전투 흐름 함수 안에 `if`가 하나씩 늘어나는 모양을 자주 봤다. 왜 그게 문제인지, 그리고 그걸 어떻게 바꾸는지를 직접 해 보고 싶었다.

그래서 유니크 세 개짜리 작은 실습을 만들고, **일부러 구조 생각 없이 `if`로 먼저 짠 다음** 그걸 리팩토링했다. 리팩토링 이유는 처음에 이렇게 정리했다.

> 기존에는 유니크마다 "언제 · 발동해도 되나 · 무엇을 하나"를 매번 새로 구현했다. 이 세 부분(사건 · 조건 · 효과)을 따로 만들어 조립할 수 있게 하면, 새 유니크를 함수 수정 없이 확장할 수 있다.

이 노트는 그 첫 단계다. 유니크 하나를 class 하나로 떼어 내고, `if` 대신 **Observer 구독**으로 붙인다. 사건 · 조건 · 효과를 완전히 쪼개는 건 그다음 단계다.

**한 줄 결론: 유니크 코드를 영웅과 전투 흐름에서 빼내고, 영웅은 "지금 피해를 고치는 중이다" 같은 사건만 알린다. 유니크 모드는 필요한 사건만 구독한다. 이때 사건의 순서와 사용 기록을 어디에 둘지가 실제로 설계를 가르는 곳이었다.**

실습의 유니크 세 개는 이렇다.

| 유니크 | 규칙 |
|---|---|
| 치명상 버티기 | 스테이지당 한 번, 쓰러질 피해를 받으면 체력 1로 버틴다. 같은 스테이지에서 장비를 뺐다 다시 껴도 다시 못 쓴다 |
| 다섯 번째 평타 치명타 | 평타 다섯 번째마다 피해 2배 |
| 받는 피해 감소 | 받는 피해 10% 감소. 두 개 끼면 20%. 치명상 버티기와 같이 끼면 감소가 먼저고, 쓰러지나 판정은 줄어든 피해로 한다 |

## 1. 리팩토링 전 — if가 쌓이는 자리

구조 생각 없이 짜면 이렇게 된다.

```csharp
// Hero.TakeDamage
if (HasUnique(EUniqueType.DamageTakenReduction10))
{
    int reductionValue = CountUnique(EUniqueType.DamageTakenReduction10);
    incomingDamage *= (1f - (0.1f * reductionValue));
}

if (CurrentHp - incomingDamage > 0f)
{
    CurrentHp -= incomingDamage;
    return;
}

if (_surviveLethalOnceCount == 0 && HasUnique(EUniqueType.SurviveLethalOncePerStage))
{
    CurrentHp = 1f;
    ++_surviveLethalOnceCount;
    return;
}
CurrentHp = 0f;
```

```csharp
// Battle.BaseAttack
if (attacker.HasUnique(EUniqueType.EveryFifthBaseAttackCritical) && attacker.AttackCount % 5 == 0)
{
    criticalAttack = true;
}
```

유니크 하나의 코드가 여러 파일에 흩어진다.

| 유니크 | 코드가 있던 곳 |
|---|---|
| 치명상 버티기 | `Hero.TakeDamage`(버티기), `Hero`의 필드(사용 기록), `Stage.StartStage` → `Hero`(스테이지마다 초기화) |
| 다섯 번째 평타 치명타 | `Battle.BaseAttack`(판정), `Hero`(평타 횟수) |
| 받는 피해 감소 | `Hero.TakeDamage` |

"스테이지 시작 때 체력 20 회복" 같은 유니크가 하나 더 생기면 `Stage`와 `Hero`를 또 고쳐야 한다. 유니크가 20개면 `TakeDamage`는 `if` 20개가 된다.

## 2. 고치기 전에 동작부터 고정한다

리팩토링은 **동작은 그대로 두고 구조만 바꾸는 것**이다. 그래서 먼저 지금 동작을 시나리오 6개로 고정하는 검사기를 만들고, 리팩토링하는 동안 이 파일은 고치지 않았다 (특성 테스트, characterization test).

| 시나리오 | 보는 것 |
|---|---|
| 유니크 없음 | 기본 피해 처리 |
| 치명상 버티기 | 첫 스테이지에서 버팀, 새 스테이지에서 다시 버팀, 같은 스테이지에서는 못 버팀 |
| 치명상 버티기 뺐다 끼기 | 같은 스테이지에서 장비를 뺐다 다시 껴도 못 버팀 |
| 다섯 번째 평타 치명타 | 평타 10번 중 5번째, 10번째만 치명타 |
| 받는 피해 감소 | 한 개 10%, 두 개 20%, 빼면 그만큼 돌아옴 |
| 받는 피해 감소 + 치명상 버티기 | 감소 먼저, 판정 나중 |

리팩토링은 작게 쪼개서, **시나리오 6개가 모두 성공인 지점마다 커밋**했다. 깨지면 바로 앞 커밋으로 돌아가 그 단계만 다시 하면 된다.

검사기를 딱 한 번 고친 적이 있다. 처음 실습은 `hero.Equip(EUniqueType.DamageTakenReduction10)`처럼 유니크 종류로 장비를 꼈는데, 실제 게임에서 유니크는 **장비에 달려 있고 장비는 고유 번호로 구분**된다. 같은 유니크가 달린 장비를 두 개 꼈다가 하나를 뺄 때, 유니크 종류만으로는 어느 장비인지 고를 수 없다. 그래서 장비 class(`Gear`, `ulong` 고유 번호)를 만들고 `Equip(gear)`, `Unequip(gearUniqueId)`로 바꿨다. 이때도 **부르는 모양만 바꾸고 정답 값은 한 줄도 안 바꿨고**, 6개가 그대로 성공해서 동작이 같다는 걸 값으로 확인했다.

## 3. Observer class를 직접 만든다

사건을 알리는 방법은 C# `event`, UniRx, 직접 만든 Observer class가 있다. 회사 선임 코드가 Observer class를 따로 두고 `Subscribe` / `Notify`를 쓰는 방식이라, 안이 어떻게 생겼는지 보려고 직접 만들었다.

```csharp
public class Observer<T>
{
    private readonly List<Action<T>> _listeners = new List<Action<T>>();

    public void Subscribe(Action<T> listener)   { _listeners.Add(listener); }
    public void Unsubscribe(Action<T> listener) { _listeners.Remove(listener); }

    public void Notify(T value)
    {
        foreach (var listener in _listeners)
        {
            listener(value);
        }
    }
}
```

셋 다 옵저버 패턴이고, **알림 목록을 누가 관리하나**가 다르다.

| | C# `event` | 직접 만든 Observer | UniRx `Subject` |
|---|---|---|---|
| 등록 / 해제 | `+=` / `-=` | `Subscribe` / `Unsubscribe` | `Subscribe`가 돌려준 것을 `Dispose()` |
| 알리기 | `?.Invoke(...)` | `Notify(...)` | `OnNext(...)` |
| 바깥에서 알리기 막기 | `event`가 막아 줌 | 안 막힘 | `AsObservable()`로 감춤 |
| 넘길 값이 없는 사건 | `Action` | 값 없는 class를 따로 만들거나 값을 하나 넘김 | `Subject<Unit>` |

## 4. 영웅의 사건과, 사건에 넘기는 상자

`Hero`는 사건 세 개를 갖고 알리기만 한다. 이름은 -ing(일어나기 직전, 구독자가 끼어들 수 있음) 규칙으로 지었다 (공식 문서: .NET 이벤트 이름 지침).

| 사건 | 알리는 때 | 구독하는 유니크 |
|---|---|---|
| `DamageModifying` | 피해 값을 고치는 중 | 받는 피해 감소 |
| `DamageApplying` | 고친 피해를 체력에 적용하기 직전 | 치명상 버티기 |
| `BaseAttacking` | 평타 피해를 계산하기 전 | 다섯 번째 평타 치명타 |

사건에 넘기는 값은 **구독자가 고칠 수 있는 class 상자**다.

```csharp
public class DamageContext
{
    public float Damage;
    public float DamageDecreaseRatio;
}

public class BaseAttackContext
{
    public bool IsCritical;
}
```

| 왜 | 이유 |
|---|---|
| class(참조 형식)인가 | `float` 하나만 넘기면 구독자는 복사본을 받아서, 고쳐도 `TakeDamage` 쪽 값은 그대로다 |
| `readonly`가 아닌가 | 고치라고 만든 상자라서. 평타가 끝난 뒤의 결과 보고서(`AttackResult`)는 `readonly`로 두고 역할을 나눴다 |
| 반환값으로 받지 않나 | 구독자가 여럿이면 반환값은 마지막 구독자 것만 남는다 (공식 문서: 멀티캐스트 델리게이트). 그래서 상자를 고쳐서 돌려준다 |

치명상 버티기를 위해 처음에는 `ShouldSurviveAtOneHp` 같은 칸을 상자에 넣으려 했다. 그런데 그건 **유니크 하나만을 위한 칸**이라, 유니크가 늘면 공용 상자에 칸이 계속 늘고 `TakeDamage`가 그 칸을 읽는 `if`도 는다. `if`가 쌓이던 문제가 상자로 옮겨 올 뿐이라 넣지 않았다. 치명상 버티기는 피해 값을 "체력 − 1"로 고치는 것으로 했다.

## 5. 같은 사건 안에서는 구독 순서가 실행 순서다

처음에는 받는 피해 감소와 치명상 버티기를 둘 다 "피해를 적용하기 직전" 사건 하나에 붙였다. 그러자 **장비를 낀 순서**에 따라 결과가 달라졌다. 치명상 버티기 장비를 먼저 끼고, 체력 100에 피해 105를 받으면 이렇게 된다.

| 순서 | 누가 | 일어난 일 |
|---|---|---|
| 1 | 치명상 버티기 (먼저 구독) | 105를 보고 "쓰러진다" → 피해를 99로 고치고 **사용 기록 +1** |
| 2 | 받는 피해 감소 | 99 × 0.9 = 89.1 |
| 결과 | | 체력 10.9. 정답은 105 × 0.9 = 94.5만 받아서 **5.5, 치명상 버티기는 안 씀** |

쓸 필요가 없는데 써 버렸고, 그래서 다음 쓰러질 피해에서는 못 버텼다.

그래서 피해 사건을 **두 단계로 쪼갰다**. 값을 고치는 유니크는 `DamageModifying`, 판정하는 유니크는 `DamageApplying`에 붙는다. 순서는 `TakeDamage` 안에서 두 사건을 부르는 **코드 순서**가 정하니, 장비를 어떤 순서로 껴도 "줄이고 나서 판정"이 지켜진다.

```csharp
DamageContext damageContext = new DamageContext(incomingDamage);
DamageModifying.Notify(damageContext);                              // 1단계: 값 고치기
damageContext.Damage *= (1f - damageContext.DamageDecreaseRatio);
DamageApplying.Notify(damageContext);                               // 2단계: 판정
// 그다음 체력 깎기
```

참고로 이때 나온 체력 `10.900002`의 끝자리는 부동소수점 오차다 (89.1이 `float`으로 정확히 표현되지 않음). 소수점 아래 아주 작은 차이는 오차, 딱 떨어지는 차이는 계산식이 다른 것이다.

## 6. 유니크 모드 class

유니크 하나 = `UniqueModBase`를 상속한 class 하나다. 장비를 끼면 만들어져 영웅에 붙고(`Attach`), 빼면 떨어진다(`Detach`).

```csharp
public abstract class UniqueModBase
{
    protected Hero _ownerHero;

    public virtual void Attach(Hero hero)
    {
        _ownerHero = hero;
        SubscribeEvents(hero);
    }

    public virtual void Detach()
    {
        UnsubscribeEvents(_ownerHero);
        _ownerHero = null;
    }

    protected abstract void SubscribeEvents(Hero hero);
    protected abstract void UnsubscribeEvents(Hero hero);
}
```

| 정한 것 | 이유 |
|---|---|
| `abstract class` | 모든 유니크가 "자기 영웅 기억하기, 붙이고 떼기"를 똑같이 한다. 공통 필드와 공통 코드는 부모에 한 번만 |
| 숫자는 class 이름이 아니라 생성자로 | `EveryNthBaseAttackCriticalMod(5)`. "세 번째 평타마다 치명타" 유니크가 생겨도 class를 새로 안 만들고 `(3)`으로 만든다. 숫자가 들어간 건 게임 아이템 이름(enum 값)이고, class는 동작이다 |
| 알림 받는 메서드 이름은 `On` + 사건 이름 | `OnDamageModifying`, `OnDamageApplying`, `OnBaseAttacking`. 어느 사건에 붙은 메서드인지 이름으로 보인다 |
| `Attach` / `Detach`를 `virtual`로 | 스테이지 사건이 필요한 유니크(치명상 버티기)만 `override`해서 구독을 덧붙인다. 다른 유니크는 아무것도 안 해도 된다 |

## 7. 사용 기록은 어디에 둘까

치명상 버티기의 "이번 스테이지에 썼나"를 어디에 두느냐가 가장 오래 고민한 곳이다. 기준은 두 질문이었다. **언제 지워져야 하나, 무엇을 하면 지워지면 안 되나.**

| 둔 곳 | 일어나는 일 |
|---|---|
| 유니크 모드 객체의 필드 | 장비를 빼면 객체가 버려지고, 다시 끼면 기록 0인 새 객체 → **빼고 끼기만 반복하면 한 스테이지 내내 안 죽는다** |
| 유니크 모드 class의 static 숫자 하나 | 빼고 껴도 안 사라진다. 그런데 static은 class에 하나라, 기사가 버티면 **같은 장비를 낀 궁수도 못 버틴다** |
| class의 static Dictionary, **영웅 고유 키 → 횟수** | 빼고 껴도 남고, 영웅끼리 안 섞인다 |

세 번째로 했다. 영웅마다 겹치지 않는 고유 키(`HeroKey`)를 붙이고, 스테이지가 시작되면 Dictionary를 통째로 비운다. 회사 코드도 "장비를 바꿔도 사라지면 안 되는 값"은 유니크 모드 class의 static에 두고 스테이지 시작 · 재시작 사건에 초기화를 물려 두는 방식이었다.

```csharp
public class SurviveLethalMod : UniqueModBase
{
    // 영웅 고유 키 → 이번 스테이지에 버틴 횟수
    private static Dictionary<int, int> _activateHistory = new();

    public override void Attach(Hero hero)
    {
        base.Attach(hero);
        Stage.OnStageStart.Subscribe(Reset);
    }

    public override void Detach()
    {
        base.Detach();
        Stage.OnStageStart.Unsubscribe(Reset);
    }

    private void Reset(Stage stage)
    {
        _activateHistory.Clear();
    }

    private void OnDamageApplying(DamageContext context)
    {
        if (!_activateHistory.TryGetValue(_ownerHero.HeroKey, out int count) || count <= 0)
        {
            if (_ownerHero.CurrentHp - context.Damage <= 0)
            {
                context.Damage = _ownerHero.CurrentHp - 1f;
                if (!_activateHistory.TryAdd(_ownerHero.HeroKey, 1))
                {
                    _activateHistory[_ownerHero.HeroKey]++;
                }
            }
        }
    }
}
```

이걸 짜면서 실제로 걸린 것들이다.

| 쓴 코드 | 일어난 일 | 바로잡은 것 |
|---|---|---|
| `TryGetValue(...) && count <= 0` | 스테이지 처음엔 기록이 없어서 `TryGetValue`가 `false` → 한 번도 안 버팀 | "기록 없음"은 "아직 안 씀"이다. `!TryGetValue(...) \|\| count <= 0` |
| `_activateHistory[key]++` | 키가 없을 때 `++`의 읽기에서 `KeyNotFoundException` | 없으면 넣고, 있으면 더하기 (`TryAdd` 먼저) |
| 기록 늘리기를 "쓰러질 피해인가" `if` 바깥에 둠 | 쓰러지지 않는 피해에도 "썼다"로 기록 → 정작 쓰러질 때 못 버팀 | 체력 1로 버티게 한 자리 안에서만 기록 |
| 구독 `Subscribe(stage => Reset())`, 해제 `Unsubscribe(stage => Reset())` | 글자는 같아도 두 람다는 **다른 객체**라 해제가 안 되고, 구독이 계속 쌓임 | 구독과 해제에 같은 메서드(`Reset`)를 넘긴다 |
| 장비를 뺄 때 스테이지 사건만 해제하고 영웅 사건은 해제 안 함 | 장비를 빼도 받는 피해 감소가 계속 20% | 붙일 때 한 일을 뗄 때 모두 되돌린다 (`Detach`) |

## 8. 장비 → 유니크 모드 객체는 static 관리자가

`Hero`가 유니크 모드 객체 목록과 "유니크 종류 → 객체 만들기" `switch`까지 들고 있으면, 영웅 class에 유니크 사정이 남는다. 그래서 static `UniqueModHandler`로 뺐다.

| 누가 | 하는 일 |
|---|---|
| `Hero.Equip` / `Unequip` | 장비 목록에 넣고 빼고, `UniqueModHandler`에 넘기기만 |
| `UniqueModHandler` (static) | 유니크 종류로 객체 만들기, 장비 번호 → 객체 목록, 낄 때 `Attach`, 뺄 때 `Detach` |

사용 횟수는 static 하나로 두면 영웅끼리 섞였는데, **장비 번호 → 객체** 목록은 static 하나로 둬도 된다. 장비 고유 번호가 게임 전체에서 겹치지 않아서, 기사의 장비와 궁수의 장비가 같은 칸을 쓸 일이 없기 때문이다. 같은 static이라도 **키가 무엇이냐**가 괜찮은지 아닌지를 정했다.

새 유니크가 생기면 고칠 곳은 이제 `UniqueModHandler`의 `switch` 한 줄과 새 유니크 모드 class 하나다. `Hero`, `Battle`, `Stage`에는 유니크 이름이 남지 않는다.

## 9. 남겨 둔 것

`TakeDamage`가 아직 감소 비율을 곱하는 계산까지 하고 있다. 이름은 "피해를 받는다"인데 "피해를 어떻게 계산하나"라는 규칙이 섞여 있어서, 다른 종류의 피해 보정이 생기면 이 줄이 다시 늘어난다. 피해 계산 흐름을 한곳으로 모으는 리팩토링에서 함께 다루기로 하고, 코드에도 그렇게 적어 뒀다.

## 정리

1. 유니크 코드를 영웅과 전투 흐름에서 빼고, 영웅은 사건만 알린다. 유니크 모드는 필요한 사건만 구독한다
2. 리팩토링 전에 검사기로 동작을 고정하고, 시나리오가 모두 성공인 지점마다 작게 커밋한다
3. 사건에 넘기는 값은 구독자가 고칠 수 있는 class 상자. 특정 유니크 전용 칸은 공용 상자에 넣지 않는다
4. 같은 사건 안에서는 구독 순서가 실행 순서다. 순서가 중요하면 사건을 단계로 쪼개서 코드 순서로 정한다
5. 숫자는 class 이름이 아니라 생성자 값으로. class는 동작, enum 값은 게임 아이템
6. 사용 기록은 "언제 지워져야 하나, 무엇을 하면 지워지면 안 되나"로 둘 곳을 정한다. 빼고 끼기로 사라지면 안 되고 영웅끼리 섞이면 안 되면, class의 static Dictionary를 영웅 키로
7. 구독과 해제에는 같은 메서드를 넘긴다. 람다는 매번 다른 객체다
8. static으로 모아도 되는지는 키가 겹치느냐로 판단한다

## 더 보기

- [박싱 / 언박싱 — Dictionary와 struct](boxing-dictionary.md) — 값 형식과 참조 형식. 상자를 class로 만든 이유와 이어진다
- [상태 전파 — event, static, ReactiveProperty](state-propagation.md) — event와 UniRx를 처음 비교했던 노트
