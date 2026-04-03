#!/usr/bin/env python3
"""
ML model to predict quiz correctness from logged context features.
Loads data from JSON (exported from Supabase via MCP or Python client).

Data export should include: correct, question_modality, answer_modality,
context, knowledge_before, knowledge_after, vocabulary_id, created_at.

To refresh data via Python client:
    python -c "
import json
from supabase import create_client
env = {}
with open('.env') as f:
    for line in f:
        if '=' in line and not line.startswith('#'):
            k, v = line.strip().split('=', 1)
            env[k] = v
supabase = create_client(env['VITE_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'])
all_data = []
offset = 0
while True:
    data = supabase.table('quiz_attempts').select(
        'correct,question_modality,answer_modality,context,knowledge_before,knowledge_after,vocabulary_id,created_at'
    ).not_.is_('context', 'null').range(offset, offset + 999).execute()
    all_data.extend(data.data)
    if len(data.data) < 1000:
        break
    offset += 1000
with open('analysis/quiz_attempts_data.json', 'w') as f:
    json.dump(all_data, f, indent=2)
print(f'Exported {len(all_data)} records')
"
"""

import json
import warnings
import numpy as np
from pathlib import Path
from collections import defaultdict

from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import (
    accuracy_score, classification_report, confusion_matrix,
    roc_auc_score, f1_score, brier_score_loss,
)
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import (
    RandomForestClassifier, HistGradientBoostingClassifier,
)
from sklearn.calibration import CalibratedClassifierCV

warnings.filterwarnings('ignore', category=RuntimeWarning)

MODALITIES = ['character', 'pinyin', 'meaning', 'audio']
MODALITY_PAIRS = [f"{q}->{a}" for q in MODALITIES for a in MODALITIES if q != a]


def load_quiz_attempts():
    """Load quiz attempts from local JSON file."""
    data_path = Path(__file__).parent / 'quiz_attempts_data.json'

    if not data_path.exists():
        raise FileNotFoundError(
            f"Data file not found: {data_path}\n"
            "Run the export command in the module docstring to fetch fresh data."
        )

    with open(data_path) as f:
        return json.load(f)


def compute_attempt_numbers(data):
    """Compute per-concept attempt number (nth time this word was tested).
    Data must be sorted by created_at."""
    counters = defaultdict(int)
    attempt_nums = []
    for d in data:
        vid = d.get('vocabulary_id', '')
        counters[vid] += 1
        attempt_nums.append(counters[vid])
    return attempt_nums


def extract_features(attempt, attempt_num):
    """Extract numerical features from a quiz attempt."""
    ctx = attempt.get('context', {}) or {}
    concept = ctx.get('conceptKnowledge', {}) or {}
    user_avg = ctx.get('userAverages', {}) or {}
    distractors = ctx.get('distractors', []) or []

    answer_knowledge = concept.get('answerModality', 50)
    question_knowledge = concept.get('questionModality', 50)
    overall_knowledge = concept.get('overall', 50)

    user_char = user_avg.get('character', 60)
    user_pinyin = user_avg.get('pinyin', 60)
    user_meaning = user_avg.get('meaning', 60)
    user_audio = user_avg.get('audio', 60)

    dist_knowledge = [d.get('knowledge', 50) for d in distractors]
    dist_avg = float(np.mean(dist_knowledge)) if dist_knowledge else 50.0
    dist_max = float(max(dist_knowledge)) if dist_knowledge else 50.0

    knowledge_gap = answer_knowledge - dist_avg

    days_since = ctx.get('daysSinceLastAttempt')
    days_since = days_since if days_since is not None else 0

    predicted = ctx.get('predictedCorrect', 50)

    knowledge_before = attempt.get('knowledge_before')
    knowledge_before = knowledge_before if knowledge_before is not None else 50

    q_mod = attempt.get('question_modality', 'character')
    a_mod = attempt.get('answer_modality', 'character')
    pair = f"{q_mod}->{a_mod}"
    pair_features = [1 if p == pair else 0 for p in MODALITY_PAIRS]

    features = [
        answer_knowledge,
        question_knowledge,
        overall_knowledge,
        knowledge_before,
        user_char,
        user_pinyin,
        user_meaning,
        user_audio,
        dist_avg,
        dist_max,
        knowledge_gap,
        days_since,
        predicted,
        attempt_num,
    ] + pair_features

    return [float(np.clip(f, -1e6, 1e6)) for f in features]


FEATURE_NAMES = [
    'answer_knowledge',
    'question_knowledge',
    'overall_knowledge',
    'knowledge_before',
    'user_character',
    'user_pinyin',
    'user_meaning',
    'user_audio',
    'distractor_avg',
    'distractor_max',
    'knowledge_gap',
    'days_since_last',
    'predicted_correct',
    'concept_attempt_num',
] + MODALITY_PAIRS


def evaluate_model(name, y_true, y_pred, y_proba):
    """Print evaluation metrics for a model."""
    acc = accuracy_score(y_true, y_pred)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    try:
        auc = roc_auc_score(y_true, y_proba)
    except ValueError:
        auc = 0.5
    brier = brier_score_loss(y_true, y_proba)

    print(f"\n  {name}:")
    print(f"    Accuracy:    {acc:.3f}")
    print(f"    F1 (correct):{f1:.3f}")
    print(f"    ROC-AUC:     {auc:.3f}")
    print(f"    Brier Score: {brier:.4f}  (lower = better calibrated)")

    cm = confusion_matrix(y_true, y_pred)
    print(f"    Confusion:   TN={cm[0,0]} FP={cm[0,1]} FN={cm[1,0]} TP={cm[1,1]}")
    return {'accuracy': acc, 'f1': f1, 'roc_auc': auc, 'brier': brier}


def print_calibration(y_true, y_proba, label=""):
    """Print calibration table."""
    bins = [(0, 0.3), (0.3, 0.5), (0.5, 0.7), (0.7, 0.85), (0.85, 1.01)]
    if label:
        print(f"\n  {label}:")
    for low, high in bins:
        mask = (y_proba >= low) & (y_proba < high)
        if mask.sum() > 0:
            actual = y_true[mask].mean()
            predicted = y_proba[mask].mean()
            delta = actual - predicted
            print(f"    P({low:.2f}-{high:.2f}): n={mask.sum():3d}  "
                  f"pred={predicted:.2f}  actual={actual:.2f}  "
                  f"delta={delta:+.2f}")


def main():
    print(f"\n{'='*60}")
    print("QUIZ ML MODEL v2 — Predicting Correctness")
    print(f"{'='*60}")

    data = load_quiz_attempts()
    data = [d for d in data if d.get('context')]
    data.sort(key=lambda d: d.get('created_at', ''))
    print(f"\nTotal attempts with context: {len(data)}")

    if len(data) < 50:
        print("Not enough data. Need at least 50 samples.")
        return

    attempt_nums = compute_attempt_numbers(data)

    X, y = [], []
    for attempt, anum in zip(data, attempt_nums):
        X.append(extract_features(attempt, anum))
        y.append(1 if attempt['correct'] else 0)

    X = np.array(X, dtype=np.float64)
    y = np.array(y)

    n_correct = sum(y)
    n_incorrect = len(y) - n_correct
    print(f"Correct:   {n_correct} ({100*n_correct/len(y):.1f}%)")
    print(f"Incorrect: {n_incorrect} ({100*n_incorrect/len(y):.1f}%)")
    print(f"Features:  {X.shape[1]} ({len(FEATURE_NAMES)} named)")
    majority_baseline = max(n_correct, n_incorrect) / len(y)
    print(f"Majority class baseline: {majority_baseline:.3f}")

    # ── Stratified 5-fold CV with cross_val_predict ──────────────
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    models = {
        'Logistic Regression': LogisticRegression(
            random_state=42, max_iter=2000, class_weight='balanced', C=0.1,
        ),
        'Random Forest': RandomForestClassifier(
            random_state=42, n_estimators=200, class_weight='balanced',
            max_depth=8, min_samples_leaf=5,
        ),
        'Hist Gradient Boosting': HistGradientBoostingClassifier(
            random_state=42, max_iter=300, max_depth=5,
            min_samples_leaf=10, learning_rate=0.05,
            class_weight='balanced',
        ),
    }

    print(f"\n{'='*60}")
    print("5-FOLD CROSS-VALIDATED RESULTS")
    print(f"{'='*60}")

    results = {}
    probas = {}
    preds = {}

    for name, model in models.items():
        use_scaled = name == 'Logistic Regression'
        X_use = X_scaled if use_scaled else X

        y_proba = cross_val_predict(
            model, X_use, y, cv=cv, method='predict_proba',
        )[:, 1]
        y_pred = (y_proba >= 0.5).astype(int)

        results[name] = evaluate_model(name, y, y_pred, y_proba)
        probas[name] = y_proba
        preds[name] = y_pred

    # ── Calibrated Hist Gradient Boosting ────────────────────────
    cal_model = CalibratedClassifierCV(
        models['Hist Gradient Boosting'],
        cv=cv, method='isotonic',
    )
    y_proba_cal = cross_val_predict(
        cal_model, X, y, cv=cv, method='predict_proba',
    )[:, 1]
    y_pred_cal = (y_proba_cal >= 0.5).astype(int)

    results['HGB + Calibration'] = evaluate_model(
        'HGB + Calibration', y, y_pred_cal, y_proba_cal,
    )
    probas['HGB + Calibration'] = y_proba_cal

    # ── Feature importance (retrain on full data) ────────────────
    print(f"\n{'='*60}")
    print("FEATURE IMPORTANCE (full-data refit)")
    print(f"{'='*60}")

    best_name = max(results, key=lambda k: results[k]['roc_auc'])
    print(f"\nBest model by ROC-AUC: {best_name} "
          f"(AUC={results[best_name]['roc_auc']:.3f})")

    # Refit RF and HGB on full data for feature importance
    rf_full = models['Random Forest']
    rf_full.fit(X, y)
    hgb_full = models['Hist Gradient Boosting']
    hgb_full.fit(X, y)

    print("\nRandom Forest:")
    rf_imp = sorted(
        zip(FEATURE_NAMES, rf_full.feature_importances_),
        key=lambda x: x[1], reverse=True,
    )
    for name, imp in rf_imp[:15]:
        bar = "█" * int(imp * 50)
        print(f"  {name:22s}: {imp:.3f} {bar}")

    print("\nHist Gradient Boosting:")
    # permutation-free importance not available; use internal if exists
    try:
        hgb_importances = hgb_full.feature_importances_  # sklearn >= 1.4 removed, but try
    except AttributeError:
        from sklearn.inspection import permutation_importance
        perm = permutation_importance(hgb_full, X, y, n_repeats=10, random_state=42)
        hgb_importances = perm.importances_mean

    hgb_imp = sorted(
        zip(FEATURE_NAMES, hgb_importances),
        key=lambda x: abs(x[1]), reverse=True,
    )
    for name, imp in hgb_imp[:15]:
        bar = "█" * int(abs(imp) * 50)
        print(f"  {name:22s}: {imp:.3f} {bar}")

    # LR coefficients
    lr_full = models['Logistic Regression']
    lr_full.fit(X_scaled, y)
    print("\nLogistic Regression Coefficients:")
    lr_imp = sorted(
        zip(FEATURE_NAMES, lr_full.coef_[0]),
        key=lambda x: abs(x[1]), reverse=True,
    )
    for name, coef in lr_imp[:15]:
        direction = "+" if coef > 0 else "-"
        print(f"  {direction} {name:22s}: {coef:+.4f}")

    # ── Calibration comparison ───────────────────────────────────
    print(f"\n{'='*60}")
    print("CALIBRATION COMPARISON")
    print(f"{'='*60}")

    print_calibration(y, probas['Hist Gradient Boosting'], 'HGB (uncalibrated)')
    print_calibration(y, probas['HGB + Calibration'], 'HGB + Isotonic Calibration')

    # ── Classification report for best model ─────────────────────
    print(f"\n{'='*60}")
    print(f"CLASSIFICATION REPORT — {best_name}")
    print(f"{'='*60}")
    best_preds = preds.get(best_name, y_pred_cal)
    print(classification_report(y, best_preds, target_names=['Incorrect', 'Correct']))

    # ── Summary table ────────────────────────────────────────────
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    print(f"\n  {'Model':<28s} {'Acc':>6s} {'F1':>6s} {'AUC':>6s} {'Brier':>7s}")
    print(f"  {'-'*55}")
    print(f"  {'Majority baseline':<28s} {majority_baseline:>6.3f}    --    --      --")
    for name in results:
        r = results[name]
        print(f"  {name:<28s} {r['accuracy']:>6.3f} {r['f1']:>6.3f} "
              f"{r['roc_auc']:>6.3f} {r['brier']:>7.4f}")


if __name__ == "__main__":
    main()
