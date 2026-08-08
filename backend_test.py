#!/usr/bin/env python3
"""
RepoChat Backend API Test Suite
Tests all backend endpoints with happy path and error cases
"""
import requests
import time
import json
import sys

# Base URL from .env NEXT_PUBLIC_BASE_URL
BASE_URL = "https://ai-repo-chat.preview.emergentagent.com/api"

# Test configuration
SMALL_REPO = "https://github.com/sindresorhus/slugify"
INVALID_URL = "not-a-url"
NONEXISTENT_REPO = "https://github.com/thisuser/doesnotexist-xyz-123"
MAX_POLL_TIME = 120  # seconds
POLL_INTERVAL = 2  # seconds

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def log_test(name):
    print(f"\n{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BLUE}TEST: {name}{Colors.END}")
    print(f"{Colors.BLUE}{'='*60}{Colors.END}")

def log_pass(msg):
    print(f"{Colors.GREEN}✓ PASS: {msg}{Colors.END}")

def log_fail(msg):
    print(f"{Colors.RED}✗ FAIL: {msg}{Colors.END}")

def log_info(msg):
    print(f"{Colors.YELLOW}ℹ INFO: {msg}{Colors.END}")

def parse_sse_stream(response):
    """Parse SSE stream and return list of events"""
    events = []
    for line in response.iter_lines(decode_unicode=True):
        if line.startswith('data: '):
            try:
                data = json.loads(line[6:])  # Remove 'data: ' prefix
                events.append(data)
            except json.JSONDecodeError as e:
                log_fail(f"Failed to parse SSE event: {line}, error: {e}")
    return events

# Global test state
test_results = {
    "passed": 0,
    "failed": 0,
    "tests": []
}

def record_result(test_name, passed, message=""):
    test_results["tests"].append({
        "name": test_name,
        "passed": passed,
        "message": message
    })
    if passed:
        test_results["passed"] += 1
        log_pass(f"{test_name}: {message}")
    else:
        test_results["failed"] += 1
        log_fail(f"{test_name}: {message}")

def test_auth_login():
    """Test 1: POST /api/auth/login - idempotent user creation"""
    log_test("Auth Login (Idempotent)")
    
    try:
        # First login
        resp1 = requests.post(f"{BASE_URL}/auth/login", json={"username": "tester1"}, timeout=10)
        log_info(f"First login status: {resp1.status_code}")
        
        if resp1.status_code != 200:
            record_result("Auth Login", False, f"Expected 200, got {resp1.status_code}")
            return None
        
        data1 = resp1.json()
        if "user" not in data1:
            record_result("Auth Login", False, "Response missing 'user' field")
            return None
        
        user1 = data1["user"]
        if not all(k in user1 for k in ["id", "username", "displayName"]):
            record_result("Auth Login", False, "User missing required fields")
            return None
        
        user_id = user1["id"]
        log_info(f"First login user ID: {user_id}")
        
        # Second login with same username - should return SAME user
        time.sleep(0.5)
        resp2 = requests.post(f"{BASE_URL}/auth/login", json={"username": "tester1"}, timeout=10)
        
        if resp2.status_code != 200:
            record_result("Auth Login Idempotent", False, f"Second login failed: {resp2.status_code}")
            return user_id
        
        data2 = resp2.json()
        user2 = data2.get("user", {})
        user_id2 = user2.get("id")
        
        if user_id == user_id2:
            record_result("Auth Login Idempotent", True, f"Same user ID returned: {user_id}")
        else:
            record_result("Auth Login Idempotent", False, f"Different IDs: {user_id} vs {user_id2}")
        
        return user_id
        
    except Exception as e:
        record_result("Auth Login", False, f"Exception: {str(e)}")
        return None

def test_create_repo(user_id, github_url, expect_success=True):
    """Test 2: POST /api/repos - create repository"""
    test_name = "Create Repo" if expect_success else "Create Repo (Error Case)"
    log_test(test_name)
    
    try:
        resp = requests.post(
            f"{BASE_URL}/repos",
            json={"github_url": github_url, "userId": user_id},
            timeout=10
        )
        log_info(f"Create repo status: {resp.status_code}")
        
        if expect_success:
            if resp.status_code != 200:
                record_result(test_name, False, f"Expected 200, got {resp.status_code}")
                return None
            
            data = resp.json()
            if "repo" not in data:
                record_result(test_name, False, "Response missing 'repo' field")
                return None
            
            repo = data["repo"]
            if not all(k in repo for k in ["id", "name", "status"]):
                record_result(test_name, False, "Repo missing required fields")
                return None
            
            record_result(test_name, True, f"Repo created: {repo['id']}, status: {repo['status']}")
            return repo["id"]
        else:
            if resp.status_code == 400:
                data = resp.json()
                if "error" in data:
                    record_result(test_name, True, f"Got expected 400 error: {data['error']}")
                else:
                    record_result(test_name, False, "400 response missing error message")
            else:
                record_result(test_name, False, f"Expected 400, got {resp.status_code}")
            return None
            
    except Exception as e:
        record_result(test_name, False, f"Exception: {str(e)}")
        return None

def test_poll_status(repo_id, expect_ready=True, max_time=120):
    """Test 3: Poll GET /api/repos/:id/status until ready or failed"""
    test_name = "Poll Status to Ready" if expect_ready else "Poll Status to Failed"
    log_test(test_name)
    
    try:
        start_time = time.time()
        last_status = None
        statuses_seen = []
        
        while time.time() - start_time < max_time:
            resp = requests.get(f"{BASE_URL}/repos/{repo_id}/status", timeout=10)
            
            if resp.status_code != 200:
                record_result(test_name, False, f"Status check failed: {resp.status_code}")
                return None
            
            data = resp.json()
            status = data.get("status")
            
            if status != last_status:
                statuses_seen.append(status)
                log_info(f"Status: {status}, files: {data.get('filesProcessed', 0)}/{data.get('totalFiles', 0)}, chunks: {data.get('chunksEmbedded', 0)}/{data.get('chunksTotal', 0)}")
                last_status = status
            
            if status == "ready":
                if expect_ready:
                    # Verify fields
                    file_count = data.get("fileCount", 0)
                    chunk_count = data.get("chunkCount", 0)
                    
                    if file_count > 0 and chunk_count > 0:
                        record_result(test_name, True, f"Ready with {file_count} files, {chunk_count} chunks. Statuses: {' -> '.join(statuses_seen)}")
                    else:
                        record_result(test_name, False, f"Ready but fileCount={file_count}, chunkCount={chunk_count}")
                    return data
                else:
                    record_result(test_name, False, "Expected failed but got ready")
                    return data
            
            elif status == "failed":
                error_msg = data.get("error", "No error message")
                if not expect_ready:
                    record_result(test_name, True, f"Failed as expected: {error_msg}")
                else:
                    record_result(test_name, False, f"Unexpected failure: {error_msg}")
                return data
            
            time.sleep(POLL_INTERVAL)
        
        # Timeout
        record_result(test_name, False, f"Timeout after {max_time}s, last status: {last_status}")
        return None
        
    except Exception as e:
        record_result(test_name, False, f"Exception: {str(e)}")
        return None

def test_list_repos(user_id, expected_repo_id):
    """Test 4: GET /api/repos?userId=X"""
    log_test("List Repos")
    
    try:
        resp = requests.get(f"{BASE_URL}/repos?userId={user_id}", timeout=10)
        log_info(f"List repos status: {resp.status_code}")
        
        if resp.status_code != 200:
            record_result("List Repos", False, f"Expected 200, got {resp.status_code}")
            return
        
        data = resp.json()
        if "repos" not in data:
            record_result("List Repos", False, "Response missing 'repos' field")
            return
        
        repos = data["repos"]
        repo_ids = [r.get("id") for r in repos]
        
        if expected_repo_id in repo_ids:
            record_result("List Repos", True, f"Found repo {expected_repo_id} in list of {len(repos)} repos")
        else:
            record_result("List Repos", False, f"Repo {expected_repo_id} not in list")
            
    except Exception as e:
        record_result("List Repos", False, f"Exception: {str(e)}")

def test_get_tree(repo_id):
    """Test 5: GET /api/repos/:id/tree"""
    log_test("Get Repo Tree")
    
    try:
        resp = requests.get(f"{BASE_URL}/repos/{repo_id}/tree", timeout=10)
        log_info(f"Get tree status: {resp.status_code}")
        
        if resp.status_code != 200:
            record_result("Get Tree", False, f"Expected 200, got {resp.status_code}")
            return None
        
        data = resp.json()
        if "files" not in data:
            record_result("Get Tree", False, "Response missing 'files' field")
            return None
        
        files = data["files"]
        if len(files) == 0:
            record_result("Get Tree", False, "Files array is empty")
            return None
        
        # Verify file structure
        first_file = files[0]
        if not all(k in first_file for k in ["path", "language", "size"]):
            record_result("Get Tree", False, "File missing required fields")
            return None
        
        record_result("Get Tree", True, f"Got {len(files)} files")
        return files
        
    except Exception as e:
        record_result("Get Tree", False, f"Exception: {str(e)}")
        return None

def test_get_file(repo_id, file_path):
    """Test 6: GET /api/repos/:id/file?path=X"""
    log_test("Get File Content")
    
    try:
        resp = requests.get(f"{BASE_URL}/repos/{repo_id}/file?path={file_path}", timeout=10)
        log_info(f"Get file status: {resp.status_code}")
        
        if resp.status_code != 200:
            record_result("Get File", False, f"Expected 200, got {resp.status_code}")
            return
        
        data = resp.json()
        if "file" not in data:
            record_result("Get File", False, "Response missing 'file' field")
            return
        
        file = data["file"]
        if not all(k in file for k in ["path", "content", "language"]):
            record_result("Get File", False, "File missing required fields")
            return
        
        content = file.get("content", "")
        if len(content) == 0:
            record_result("Get File", False, "File content is empty")
            return
        
        record_result("Get File", True, f"Got file {file_path}, {len(content)} chars")
        
    except Exception as e:
        record_result("Get File", False, f"Exception: {str(e)}")

def test_chat_sse(repo_id, message, session_id=None):
    """Test 7 & 8: POST /api/repos/:id/chat - SSE stream"""
    test_name = "Chat SSE (New Session)" if not session_id else "Chat SSE (Existing Session)"
    log_test(test_name)
    
    try:
        payload = {"message": message}
        if session_id:
            payload["sessionId"] = session_id
        
        resp = requests.post(
            f"{BASE_URL}/repos/{repo_id}/chat",
            json=payload,
            stream=True,
            timeout=60
        )
        
        log_info(f"Chat status: {resp.status_code}")
        log_info(f"Content-Type: {resp.headers.get('Content-Type')}")
        
        if resp.status_code != 200:
            record_result(test_name, False, f"Expected 200, got {resp.status_code}")
            return None
        
        content_type = resp.headers.get('Content-Type', '')
        if 'text/event-stream' not in content_type:
            record_result(test_name, False, f"Expected text/event-stream, got {content_type}")
            return None
        
        # Parse SSE events
        events = parse_sse_stream(resp)
        log_info(f"Received {len(events)} SSE events")
        
        # Verify event types
        event_types = [e.get("type") for e in events]
        log_info(f"Event types: {event_types}")
        
        # Check for required events
        has_session = "session" in event_types
        has_text = "text" in event_types
        has_citations = "citations" in event_types
        has_done = "done" in event_types
        
        if not has_session:
            record_result(test_name, False, "Missing 'session' event")
            return None
        
        if not has_text:
            record_result(test_name, False, "Missing 'text' event")
            return None
        
        if not has_citations:
            record_result(test_name, False, "Missing 'citations' event")
            return None
        
        if not has_done:
            record_result(test_name, False, "Missing 'done' event")
            return None
        
        # Extract session ID
        session_event = next((e for e in events if e.get("type") == "session"), None)
        returned_session_id = session_event.get("sessionId") if session_event else None
        
        if not returned_session_id:
            record_result(test_name, False, "Session event missing sessionId")
            return None
        
        # Verify session ID matches if provided
        if session_id and returned_session_id != session_id:
            record_result(test_name, False, f"Session ID mismatch: {session_id} vs {returned_session_id}")
            return None
        
        # Accumulate text
        text_events = [e for e in events if e.get("type") == "text"]
        full_text = "".join([e.get("content", "") for e in text_events])
        
        if len(full_text) == 0:
            record_result(test_name, False, "No text content in response")
            return None
        
        log_info(f"Accumulated text: {len(full_text)} chars")
        
        # Verify citations
        citations_event = next((e for e in events if e.get("type") == "citations"), None)
        citations = citations_event.get("citations", []) if citations_event else []
        
        if len(citations) == 0:
            record_result(test_name, False, "Citations array is empty")
            return None
        
        # Verify citation structure
        first_citation = citations[0]
        required_fields = ["id", "path", "startLine", "endLine"]
        if not all(k in first_citation for k in required_fields):
            record_result(test_name, False, f"Citation missing required fields: {first_citation}")
            return None
        
        record_result(test_name, True, f"Session: {returned_session_id}, text: {len(full_text)} chars, citations: {len(citations)}")
        return returned_session_id
        
    except Exception as e:
        record_result(test_name, False, f"Exception: {str(e)}")
        return None

def test_get_chat_history(repo_id, session_id):
    """Test 9: GET /api/repos/:id/chat/:sessionId"""
    log_test("Get Chat History")
    
    try:
        resp = requests.get(f"{BASE_URL}/repos/{repo_id}/chat/{session_id}", timeout=10)
        log_info(f"Get history status: {resp.status_code}")
        
        if resp.status_code != 200:
            record_result("Get Chat History", False, f"Expected 200, got {resp.status_code}")
            return
        
        data = resp.json()
        if "messages" not in data:
            record_result("Get Chat History", False, "Response missing 'messages' field")
            return
        
        messages = data["messages"]
        if len(messages) == 0:
            record_result("Get Chat History", False, "Messages array is empty")
            return
        
        # Should have at least user + assistant messages
        roles = [m.get("role") for m in messages]
        if "user" not in roles or "assistant" not in roles:
            record_result("Get Chat History", False, f"Missing user/assistant messages: {roles}")
            return
        
        record_result("Get Chat History", True, f"Got {len(messages)} messages")
        
    except Exception as e:
        record_result("Get Chat History", False, f"Exception: {str(e)}")

def test_chat_on_non_ready_repo(repo_id):
    """Error case: Chat on non-ready repo"""
    log_test("Chat on Non-Ready Repo (Error Case)")
    
    try:
        resp = requests.post(
            f"{BASE_URL}/repos/{repo_id}/chat",
            json={"message": "Test"},
            timeout=10
        )
        
        log_info(f"Chat on non-ready status: {resp.status_code}")
        
        if resp.status_code == 400:
            data = resp.json()
            error = data.get("error", "")
            if "not ready" in error.lower():
                record_result("Chat on Non-Ready Repo", True, f"Got expected 400: {error}")
            else:
                record_result("Chat on Non-Ready Repo", False, f"Wrong error message: {error}")
        else:
            record_result("Chat on Non-Ready Repo", False, f"Expected 400, got {resp.status_code}")
            
    except Exception as e:
        record_result("Chat on Non-Ready Repo", False, f"Exception: {str(e)}")

def test_get_nonexistent_repo():
    """Error case: GET nonexistent repo status"""
    log_test("Get Nonexistent Repo (Error Case)")
    
    try:
        fake_id = "nonexistent-repo-id-12345"
        resp = requests.get(f"{BASE_URL}/repos/{fake_id}/status", timeout=10)
        
        log_info(f"Get nonexistent repo status: {resp.status_code}")
        
        if resp.status_code == 404:
            record_result("Get Nonexistent Repo", True, "Got expected 404")
        else:
            record_result("Get Nonexistent Repo", False, f"Expected 404, got {resp.status_code}")
            
    except Exception as e:
        record_result("Get Nonexistent Repo", False, f"Exception: {str(e)}")

def test_delete_repo(repo_id):
    """Test DELETE /api/repos/:id"""
    log_test("Delete Repo")
    
    try:
        resp = requests.delete(f"{BASE_URL}/repos/{repo_id}", timeout=10)
        log_info(f"Delete repo status: {resp.status_code}")
        
        if resp.status_code != 200:
            record_result("Delete Repo", False, f"Expected 200, got {resp.status_code}")
            return
        
        data = resp.json()
        if not data.get("ok"):
            record_result("Delete Repo", False, "Response missing 'ok: true'")
            return
        
        # Verify repo is gone
        time.sleep(0.5)
        resp2 = requests.get(f"{BASE_URL}/repos/{repo_id}/status", timeout=10)
        
        if resp2.status_code == 404:
            record_result("Delete Repo", True, f"Repo {repo_id} deleted and verified gone")
        else:
            record_result("Delete Repo", False, f"Repo still exists after delete: {resp2.status_code}")
            
    except Exception as e:
        record_result("Delete Repo", False, f"Exception: {str(e)}")

def main():
    print(f"\n{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BLUE}RepoChat Backend API Test Suite{Colors.END}")
    print(f"{Colors.BLUE}Base URL: {BASE_URL}{Colors.END}")
    print(f"{Colors.BLUE}{'='*60}{Colors.END}")
    
    # HAPPY PATH FLOW
    print(f"\n{Colors.YELLOW}{'='*60}{Colors.END}")
    print(f"{Colors.YELLOW}HAPPY PATH TESTS{Colors.END}")
    print(f"{Colors.YELLOW}{'='*60}{Colors.END}")
    
    # 1. Login
    user_id = test_auth_login()
    if not user_id:
        print(f"\n{Colors.RED}Cannot continue without user ID{Colors.END}")
        sys.exit(1)
    
    # 2. Create repo with small GitHub URL
    repo_id = test_create_repo(user_id, SMALL_REPO, expect_success=True)
    if not repo_id:
        print(f"\n{Colors.RED}Cannot continue without repo ID{Colors.END}")
        sys.exit(1)
    
    # 3. Poll status until ready
    status_data = test_poll_status(repo_id, expect_ready=True, max_time=MAX_POLL_TIME)
    if not status_data or status_data.get("status") != "ready":
        print(f"\n{Colors.RED}Repo not ready, skipping remaining tests{Colors.END}")
        sys.exit(1)
    
    # 4. List repos
    test_list_repos(user_id, repo_id)
    
    # 5. Get tree
    files = test_get_tree(repo_id)
    if not files or len(files) == 0:
        print(f"\n{Colors.RED}No files in tree, skipping file test{Colors.END}")
    else:
        # 6. Get file content
        first_file_path = files[0].get("path")
        if first_file_path:
            test_get_file(repo_id, first_file_path)
    
    # 7. Chat with SSE (new session)
    session_id = test_chat_sse(repo_id, "What does this library do?")
    
    if session_id:
        # 8. Chat again with existing session
        test_chat_sse(repo_id, "Give an example usage", session_id=session_id)
        
        # 9. Get chat history
        test_get_chat_history(repo_id, session_id)
    
    # ERROR CASES
    print(f"\n{Colors.YELLOW}{'='*60}{Colors.END}")
    print(f"{Colors.YELLOW}ERROR CASE TESTS{Colors.END}")
    print(f"{Colors.YELLOW}{'='*60}{Colors.END}")
    
    # Error: Invalid URL
    test_create_repo(user_id, INVALID_URL, expect_success=False)
    
    # Error: Nonexistent repo (should fail during ingestion)
    failed_repo_id = test_create_repo(user_id, NONEXISTENT_REPO, expect_success=True)
    if failed_repo_id:
        test_poll_status(failed_repo_id, expect_ready=False, max_time=60)
        
        # Error: Chat on failed repo
        test_chat_on_non_ready_repo(failed_repo_id)
        
        # Delete failed repo
        test_delete_repo(failed_repo_id)
    
    # Error: Get nonexistent repo
    test_get_nonexistent_repo()
    
    # SUMMARY
    print(f"\n{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BLUE}TEST SUMMARY{Colors.END}")
    print(f"{Colors.BLUE}{'='*60}{Colors.END}")
    
    total = test_results["passed"] + test_results["failed"]
    passed = test_results["passed"]
    failed = test_results["failed"]
    
    print(f"\nTotal Tests: {total}")
    print(f"{Colors.GREEN}Passed: {passed}{Colors.END}")
    print(f"{Colors.RED}Failed: {failed}{Colors.END}")
    
    if failed > 0:
        print(f"\n{Colors.RED}Failed Tests:{Colors.END}")
        for test in test_results["tests"]:
            if not test["passed"]:
                print(f"  - {test['name']}: {test['message']}")
    
    print(f"\n{Colors.BLUE}{'='*60}{Colors.END}\n")
    
    # Exit with appropriate code
    sys.exit(0 if failed == 0 else 1)

if __name__ == "__main__":
    main()
