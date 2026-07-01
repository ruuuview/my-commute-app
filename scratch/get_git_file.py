import subprocess

try:
    content = subprocess.check_output(
        ["git", "show", "origin/feature/manage-lines-modal:components/LineCard.tsx"],
        cwd="/Users/ruuuview/Desktop/my commute project folder/frontend"
    ).decode("utf-8")
    print(content)
except Exception as e:
    print("ERROR:", e)
